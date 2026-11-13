// Saved quizzes, the public library, pictures, likes, reports, admin and account data.
//
//   GET    /api/me                      who am I (+ whether sign-in is available)
//   POST   /api/me                      { displayName?, acceptTerms? }
//   GET    /api/me/export               all my data as JSON (GDPR)
//   DELETE /api/me                      { confirm: "DELETE" } removes my account, quizzes and pictures
//   GET    /api/quizzes                 my quizzes
//   POST   /api/quizzes                 save a new quiz        { quiz, meta }
//   GET    /api/quizzes/:id             full quiz (owner or admin)
//   PUT    /api/quizzes/:id             update                 { quiz, meta }
//   DELETE /api/quizzes/:id
//   POST   /api/quizzes/:id/copy        copy a public/unlisted quiz into my account
//   POST   /api/quizzes/:id/like        toggle like
//   POST   /api/quizzes/:id/report      { reason, note }
//   GET    /api/library                 ?q=&category=&language=&age=&sort=popular|trending|new|top&page=
//   GET    /api/library/:id             public details (never the answers)
//   GET    /api/creators/:id            a creator's public quizzes
//   POST   /api/media                   upload a picture (body = image bytes)
//   GET    /media/u/<user>/<file>       serve a picture
//   GET    /api/admin/overview          admin: review queue, reports, stats
//   POST   /api/admin/quizzes/:id       admin: { action: approve | hide | restore | dismiss }
//   POST   /api/admin/users/:id         admin: { action: suspend | restore }

import { db, newId, now, today } from "./db.js";
import { currentUser, publicUser, googleReady } from "./auth.js";
import { validateSession } from "./quiz.js";
import { clean, isRude } from "./text.js";

export const CATEGORIES = {
  general: "General knowledge", tamil: "Tamil culture & language", sweden: "Sweden & Swedish", festivals: "Festivals & celebrations",
  entertainment: "Movies, music & TV", sports: "Sports & cricket", science: "Science & nature", history: "History & geography",
  kids: "Kids & school", languages: "Language learning", work: "Work & icebreakers", fun: "Fun & party",
};
const AGES = ["everyone", "kids", "teens", "adults"];
const VISIBILITY = ["private", "unlisted", "public"];
const PAGE = 24;
const MEDIA_MAX = 1.6 * 1024 * 1024;
const MEDIA_PER_USER = 300 * 1024 * 1024;
const MEDIA_TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" };
const REPORTS_TO_HIDE = 3;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const fail = (error, status = 400, extra = {}) => json({ error, ...extra }, status);

async function body(request) { try { return await request.json(); } catch { return {}; } }

// ---------- helpers ----------
function readMeta(m = {}) {
  return {
    description: clean(m.description, 300),
    category: CATEGORIES[m.category] ? m.category : "general",
    language: clean(m.language, 30) || "English",
    age: AGES.includes(m.age) ? m.age : "everyone",
    visibility: VISIBILITY.includes(m.visibility) ? m.visibility : "private",
  };
}

const allText = (quiz, meta) => [quiz.title, meta.description, ...quiz.questions.flatMap((q) => [q.text, ...(q.answers || []), ...(q.statements || [])])].join("\n");

function firstImage(quiz) {
  for (const q of quiz.questions) if (q.media && q.media.kind === "image" && q.media.src.startsWith("/media/")) return q.media.src;
  return null;
}

function card(r) {
  return {
    id: r.id, title: r.title, description: r.description, category: r.category, categoryName: CATEGORIES[r.category] || "",
    language: r.language, age: r.age, mode: r.mode, questions: r.question_count, cover: r.cover, plays: r.plays, likes: r.likes,
    creator: r.creator_name ? { id: r.owner_id, name: r.creator_name } : null, publishedAt: r.published_at, updatedAt: r.updated_at,
  };
}

function mine(r) {
  return { ...card(r), visibility: r.visibility, status: r.status, createdAt: r.created_at, copiedFrom: r.copied_from };
}

// AI safety check for quizzes going public (Llama Guard on Workers AI). "unsafe" sends the quiz to review.
async function looksUnsafe(env, text) {
  if (!env.AI || env.AI_MOCK === "1") return false;
  try {
    const out = await env.AI.run("@cf/meta/llama-guard-3-8b", { messages: [{ role: "user", content: text.slice(0, 6000) }] });
    const r = String(out?.response ?? out ?? "").toLowerCase();
    return r.trim().startsWith("unsafe");
  } catch { return false; }   // the check is a helper, not a gate: reports and admin review still apply
}

// Decide the status of a quiz that is (or becomes) public
async function publicStatus(env, DB, user, quiz, meta, wasPublicOk) {
  if (meta.visibility !== "public") return "ok";
  if (user.admin || wasPublicOk) return (await looksUnsafe(env, allText(quiz, meta))) ? "review" : "ok";
  const prior = await DB.prepare("SELECT COUNT(*) n FROM quizzes WHERE owner_id = ? AND visibility = 'public' AND status = 'ok'").bind(user.id).first();
  if (!prior || prior.n === 0) return "review";      // a new creator's first public quiz waits for approval
  return (await looksUnsafe(env, allText(quiz, meta))) ? "review" : "ok";
}

function checkQuiz(b) {
  const v = validateSession(b.quiz);
  if (v.error) return v;
  const meta = readMeta(b.meta);
  if (meta.visibility !== "private" && isRude(allText(v.value, meta))) return { error: "Please remove the words that aren't allowed before sharing this quiz." };
  return { quiz: v.value, meta };
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error("Please sign in first."), { status: 401 });
  return user;
}
function requireTerms(user) {
  if (!user.accepted_terms_at) throw Object.assign(new Error("Please accept the terms first."), { status: 403, needsTerms: true });
}

// Count a finished game (called by the game room)
export async function countPlay(env, quizId) {
  if (!env.DB || !quizId) return;
  const DB = await db(env);
  await DB.batch([
    DB.prepare("UPDATE quizzes SET plays = plays + 1 WHERE id = ?").bind(quizId),
    DB.prepare("INSERT INTO plays_daily (quiz_id, day, plays) VALUES (?, ?, 1) ON CONFLICT(quiz_id, day) DO UPDATE SET plays = plays + 1").bind(quizId, today()),
  ]);
}

// A quiz this person may start a game with: their own, or a public/unlisted quiz that isn't hidden
export async function hostableQuiz(request, env, id) {
  const DB = await db(env);
  const user = await currentUser(request, env);
  const r = await DB.prepare("SELECT * FROM quizzes WHERE id = ?").bind(id).first();
  if (!r) return null;
  const own = user && r.owner_id === user.id;
  if (!own && !(r.visibility !== "private" && r.status === "ok") && !(user && user.admin)) return null;
  return { quiz: { title: r.title, questions: JSON.parse(r.slides) }, own };
}

// ---------- routing ----------
export async function handleLibrary(request, env, url) {
  try {
    return await route(request, env, url);
  } catch (e) {
    if (e.status) return fail(e.message, e.status, e.needsTerms ? { needsTerms: true } : {});
    console.error("library error", e && (e.stack || e.message));
    return fail("Something went wrong. Please try again.", 500);
  }
}

async function route(request, env, url) {
  const p = url.pathname, method = request.method;
  let m;

  // ----- pictures -----
  if ((m = p.match(/^\/media\/(u\/[\w-]+\/[\w-]+\.(?:webp|jpg|png|gif))$/)) && method === "GET") {
    if (!env.MEDIA) return new Response("Not found", { status: 404 });
    const obj = await env.MEDIA.get(m[1]);
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/webp", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
  }
  if (p === "/api/media" && method === "POST") {
    const user = await requireUser(request, env); requireTerms(user);
    if (!env.MEDIA) return fail("Picture uploads aren't switched on yet, so pictures stay in this browser for now.", 503, { mediaOff: true });
    const type = (request.headers.get("content-type") || "").split(";")[0].trim();
    const ext = MEDIA_TYPES[type];
    if (!ext) return fail("Please upload a JPG, PNG, WebP or GIF picture.");
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MEDIA_MAX) return fail("That picture is too big (maximum 1.5 MB).");
    const DB = await db(env);
    const used = await DB.prepare("SELECT COALESCE(SUM(size), 0) n, COUNT(*) c FROM media WHERE owner_id = ?").bind(user.id).first();
    if (used.n + bytes.byteLength > MEDIA_PER_USER) return fail("You've reached the picture storage limit for your account.");
    const key = `u/${user.id}/${newId(20)}.${ext}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
    await DB.prepare("INSERT INTO media (key, owner_id, size, created_at) VALUES (?, ?, ?, ?)").bind(key, user.id, bytes.byteLength, now()).run();
    return json({ src: `/media/${key}` });
  }

  // ----- me -----
  if (p === "/api/me" && method === "GET") {
    const user = await currentUser(request, env);
    return json({ user: publicUser(user), signIn: googleReady(env) || env.DEV_LOGIN === "1", accounts: !!env.DB, media: !!env.MEDIA, dev: env.DEV_LOGIN === "1" });
  }
  if (p === "/api/me" && method === "POST") {
    const user = await requireUser(request, env);
    const b = await body(request);
    const DB = await db(env);
    if (b.displayName !== undefined) {
      const name = clean(b.displayName, 40);
      if (!name || isRude(name)) return fail("Please choose a friendlier name.");
      await DB.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(name, user.id).run();
    }
    if (b.acceptTerms === true && !user.accepted_terms_at) await DB.prepare("UPDATE users SET accepted_terms_at = ? WHERE id = ?").bind(now(), user.id).run();
    return json({ user: publicUser(await currentUser(request, env)) });
  }
  if (p === "/api/me/export" && method === "GET") {
    const user = await requireUser(request, env);
    const DB = await db(env);
    const quizzes = (await DB.prepare("SELECT * FROM quizzes WHERE owner_id = ? ORDER BY created_at").bind(user.id).all()).results.map((r) => ({ ...mine(r), slides: JSON.parse(r.slides) }));
    const likes = (await DB.prepare("SELECT quiz_id, created_at FROM likes WHERE user_id = ?").bind(user.id).all()).results;
    const media = (await DB.prepare("SELECT key, size, created_at FROM media WHERE owner_id = ?").bind(user.id).all()).results;
    const account = { id: user.id, email: user.email, name: user.name, displayName: user.display_name, picture: user.picture, createdAt: user.created_at, acceptedTermsAt: user.accepted_terms_at };
    return json({ exportedAt: new Date().toISOString(), account, quizzes, likes, pictures: media }, 200, { "content-disposition": "attachment; filename=kalakal-my-data.json" });
  }
  if (p === "/api/me" && method === "DELETE") {
    const user = await requireUser(request, env);
    if ((await body(request)).confirm !== "DELETE") return fail("Type DELETE to confirm.");
    await deleteUser(env, user.id);
    return json({ ok: true }, 200, { "Set-Cookie": `kk_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}` });
  }

  // ----- my quizzes -----
  if (p === "/api/quizzes" && method === "GET") {
    const user = await requireUser(request, env);
    const DB = await db(env);
    const rows = (await DB.prepare("SELECT * FROM quizzes WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 500").bind(user.id).all()).results;
    return json({ quizzes: rows.map(mine) });
  }
  if (p === "/api/quizzes" && method === "POST") {
    const user = await requireUser(request, env); requireTerms(user);
    const c = checkQuiz(await body(request));
    if (c.error) return fail(c.error);
    const DB = await db(env);
    const count = await DB.prepare("SELECT COUNT(*) n FROM quizzes WHERE owner_id = ?").bind(user.id).first();
    if (count.n >= 500) return fail("You've reached 500 saved quizzes. Delete some to save more.");
    const id = newId(12), t = now();
    const status = await publicStatus(env, DB, user, c.quiz, c.meta, false);
    await DB.prepare(`INSERT INTO quizzes (id, owner_id, title, description, category, language, age, mode, visibility, status, slides, question_count, cover, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, user.id, c.quiz.title, c.meta.description, c.meta.category, c.meta.language, c.meta.age, modeOf(c.quiz), c.meta.visibility, status,
        JSON.stringify(c.quiz.questions), c.quiz.questions.length, firstImage(c.quiz), t, t, c.meta.visibility === "public" ? t : null).run();
    return json({ id, status, visibility: c.meta.visibility });
  }
  if ((m = p.match(/^\/api\/quizzes\/([\w]{6,20})$/))) {
    const user = await requireUser(request, env);
    const DB = await db(env);
    const r = await DB.prepare("SELECT * FROM quizzes WHERE id = ?").bind(m[1]).first();
    if (!r || (r.owner_id !== user.id && !(user.admin && method === "GET"))) return fail("Quiz not found.", 404);
    if (method === "GET") return json({ ...mine(r), quiz: { title: r.title, questions: JSON.parse(r.slides) } });
    if (method === "DELETE") {
      await DB.batch([DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(r.id), DB.prepare("DELETE FROM likes WHERE quiz_id = ?").bind(r.id),
        DB.prepare("DELETE FROM plays_daily WHERE quiz_id = ?").bind(r.id), DB.prepare("DELETE FROM reports WHERE quiz_id = ?").bind(r.id)]);
      return json({ ok: true });
    }
    if (method === "PUT") {
      requireTerms(user);
      const c = checkQuiz(await body(request));
      if (c.error) return fail(c.error);
      // Hidden quizzes (by reports or admin) stay hidden until an admin restores them
      const status = r.status === "hidden" ? "hidden" : await publicStatus(env, DB, user, c.quiz, c.meta, r.visibility === "public" && r.status === "ok");
      const published = c.meta.visibility === "public" ? (r.published_at || now()) : r.published_at;
      await DB.prepare(`UPDATE quizzes SET title = ?, description = ?, category = ?, language = ?, age = ?, mode = ?, visibility = ?, status = ?, slides = ?, question_count = ?, cover = ?, updated_at = ?, published_at = ? WHERE id = ?`)
        .bind(c.quiz.title, c.meta.description, c.meta.category, c.meta.language, c.meta.age, modeOf(c.quiz), c.meta.visibility, status,
          JSON.stringify(c.quiz.questions), c.quiz.questions.length, firstImage(c.quiz), now(), published, r.id).run();
      return json({ id: r.id, status, visibility: c.meta.visibility });
    }
  }
  if ((m = p.match(/^\/api\/quizzes\/([\w]{6,20})\/(copy|like|report)$/)) && method === "POST") {
    const DB = await db(env);
    const r = await DB.prepare("SELECT * FROM quizzes WHERE id = ?").bind(m[1]).first();
    const user = await currentUser(request, env);
    const visible = r && (r.visibility !== "private" && r.status === "ok" || (user && r.owner_id === user.id));
    if (!visible) return fail("Quiz not found.", 404);
    if (m[2] === "report") {
      const b = await body(request);
      const reporter = user ? user.id : `ip:${await ipHash(request)}`;
      const reason = ["wrong", "offensive", "copyright", "spam", "other"].includes(b.reason) ? b.reason : "other";
      const res = await DB.prepare("INSERT OR IGNORE INTO reports (id, quiz_id, reporter, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(newId(12), r.id, reporter, reason, clean(b.note, 500), now()).run();
      if (res.meta && res.meta.changes) {
        const open = await DB.prepare("SELECT COUNT(*) n FROM reports WHERE quiz_id = ? AND status = 'open'").bind(r.id).first();
        await DB.prepare("UPDATE quizzes SET reports = ?, status = CASE WHEN ? >= ? AND status = 'ok' AND visibility = 'public' THEN 'hidden' ELSE status END WHERE id = ?")
          .bind(open.n, open.n, REPORTS_TO_HIDE, r.id).run();
      }
      return json({ ok: true });
    }
    if (!user) return fail("Please sign in first.", 401);
    if (m[2] === "like") {
      const had = await DB.prepare("SELECT 1 FROM likes WHERE user_id = ? AND quiz_id = ?").bind(user.id, r.id).first();
      await DB.batch(had
        ? [DB.prepare("DELETE FROM likes WHERE user_id = ? AND quiz_id = ?").bind(user.id, r.id), DB.prepare("UPDATE quizzes SET likes = MAX(0, likes - 1) WHERE id = ?").bind(r.id)]
        : [DB.prepare("INSERT INTO likes (user_id, quiz_id, created_at) VALUES (?, ?, ?)").bind(user.id, r.id, now()), DB.prepare("UPDATE quizzes SET likes = likes + 1 WHERE id = ?").bind(r.id)]);
      return json({ liked: !had, likes: r.likes + (had ? -1 : 1) });
    }
    if (m[2] === "copy") {
      requireTerms(user);
      const id = newId(12), t = now();
      await DB.prepare(`INSERT INTO quizzes (id, owner_id, title, description, category, language, age, mode, visibility, status, slides, question_count, cover, copied_from, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'private', 'ok', ?, ?, ?, ?, ?, ?)`)
        .bind(id, user.id, clean(`${r.title}${r.owner_id === user.id ? " (copy)" : ""}`, 80), r.description, r.category, r.language, r.age, r.mode, r.slides, r.question_count, r.cover, r.id, t, t).run();
      return json({ id });
    }
  }

  // ----- library -----
  if (p === "/api/library" && method === "GET") {
    const DB = await db(env);
    const q = clean(url.searchParams.get("q"), 60);
    const category = url.searchParams.get("category");
    const language = clean(url.searchParams.get("language"), 30);
    const age = url.searchParams.get("age");
    const sort = url.searchParams.get("sort") || "popular";
    const limit = Math.min(PAGE, Math.max(1, Number(url.searchParams.get("limit")) || PAGE));
    const page = Math.max(0, Math.min(40, Number(url.searchParams.get("page")) || 0));
    const where = ["q.visibility = 'public'", "q.status = 'ok'"], args = [];
    if (q) { where.push("(q.title LIKE ? ESCAPE '\\' OR q.description LIKE ? ESCAPE '\\')"); const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`; args.push(like, like); }
    if (CATEGORIES[category]) { where.push("q.category = ?"); args.push(category); }
    if (language) { where.push("q.language = ?"); args.push(language); }
    if (AGES.includes(age) && age !== "everyone") { where.push("(q.age = ? OR q.age = 'everyone')"); args.push(age); }
    const score = {
      popular: `(SELECT COALESCE(SUM(plays), 0) FROM plays_daily d WHERE d.quiz_id = q.id AND d.day >= '${today(30)}')`,
      trending: `(SELECT COALESCE(SUM(plays * (8 - (julianday('${today()}') - julianday(day)))), 0) FROM plays_daily d WHERE d.quiz_id = q.id AND d.day >= '${today(7)}')`,
      top: "((q.likes + 1.0) / (q.plays + 5))",
      new: "q.published_at",
    }[sort] || "q.published_at";
    const rows = (await DB.prepare(`SELECT q.*, COALESCE(u.display_name, u.name) creator_name, ${score} score FROM quizzes q LEFT JOIN users u ON u.id = q.owner_id
      WHERE ${where.join(" AND ")} ORDER BY score DESC, q.plays DESC, q.published_at DESC LIMIT ? OFFSET ?`).bind(...args, limit + 1, page * limit).all()).results;
    const langs = (await DB.prepare("SELECT language, COUNT(*) n FROM quizzes WHERE visibility = 'public' AND status = 'ok' GROUP BY language ORDER BY n DESC LIMIT 20").all()).results;
    return json({ quizzes: rows.slice(0, limit).map(card), more: rows.length > limit, categories: CATEGORIES, languages: langs.map((l) => l.language) }, 200, { "cache-control": "public, max-age=30" });
  }
  if ((m = p.match(/^\/api\/library\/([\w]{6,20})$/)) && method === "GET") {
    const DB = await db(env);
    const user = await currentUser(request, env);
    const r = await DB.prepare("SELECT q.*, COALESCE(u.display_name, u.name) creator_name FROM quizzes q LEFT JOIN users u ON u.id = q.owner_id WHERE q.id = ?").bind(m[1]).first();
    const own = user && r && r.owner_id === user.id;
    if (!r || (!own && !(user && user.admin) && !(r.visibility !== "private" && r.status === "ok"))) return fail("Quiz not found.", 404);
    const slides = JSON.parse(r.slides);
    const liked = user ? !!(await DB.prepare("SELECT 1 FROM likes WHERE user_id = ? AND quiz_id = ?").bind(user.id, r.id).first()) : false;
    const preview = slides.slice(0, 3).map((s) => ({ type: s.type, text: s.text }));     // never the answers
    const times = slides.filter((s) => s.type === "quiz").map((s) => s.time);
    return json({ ...card(r), visibility: r.visibility, status: own ? r.status : undefined, own, liked, preview,
      types: [...new Set(slides.map((s) => s.type))], avgTime: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      pictures: slides.some((s) => s.media) });
  }
  if ((m = p.match(/^\/api\/creators\/([\w]{6,20})$/)) && method === "GET") {
    const DB = await db(env);
    const u = await DB.prepare("SELECT id, COALESCE(display_name, name) name, picture, created_at FROM users WHERE id = ? AND status = 'active'").bind(m[1]).first();
    if (!u) return fail("Creator not found.", 404);
    const rows = (await DB.prepare("SELECT q.*, ? creator_name FROM quizzes q WHERE owner_id = ? AND visibility = 'public' AND status = 'ok' ORDER BY plays DESC LIMIT 60").bind(u.name, u.id).all()).results;
    return json({ creator: { id: u.id, name: u.name, picture: u.picture, since: u.created_at }, quizzes: rows.map(card) });
  }

  // ----- admin -----
  if (p.startsWith("/api/admin/")) {
    const user = await requireUser(request, env);
    if (!user.admin) return fail("Not found.", 404);
    const DB = await db(env);
    if (p === "/api/admin/overview" && method === "GET") {
      const review = (await DB.prepare("SELECT q.*, COALESCE(u.display_name, u.name) creator_name, u.email creator_email FROM quizzes q LEFT JOIN users u ON u.id = q.owner_id WHERE q.status = 'review' AND q.visibility = 'public' ORDER BY q.updated_at LIMIT 50").all()).results;
      const reported = (await DB.prepare("SELECT q.*, COALESCE(u.display_name, u.name) creator_name, u.email creator_email FROM quizzes q LEFT JOIN users u ON u.id = q.owner_id WHERE q.reports > 0 ORDER BY q.status = 'hidden' DESC, q.reports DESC LIMIT 50").all()).results;
      const reports = (await DB.prepare("SELECT quiz_id, reason, note, created_at FROM reports WHERE status = 'open' ORDER BY created_at DESC LIMIT 300").all()).results;
      const stat = async (sql, ...a) => (await DB.prepare(sql).bind(...a).first()).n;
      const withSlides = (r) => ({ ...mine(r), creatorEmail: r.creator_email, slides: JSON.parse(r.slides), reportList: reports.filter((x) => x.quiz_id === r.id) });
      return json({
        review: review.map(withSlides), reported: reported.map(withSlides),
        stats: {
          users: await stat("SELECT COUNT(*) n FROM users"), quizzes: await stat("SELECT COUNT(*) n FROM quizzes"),
          public: await stat("SELECT COUNT(*) n FROM quizzes WHERE visibility = 'public' AND status = 'ok'"),
          playsToday: await stat("SELECT COALESCE(SUM(plays), 0) n FROM plays_daily WHERE day = ?", today()),
          plays30: await stat("SELECT COALESCE(SUM(plays), 0) n FROM plays_daily WHERE day >= ?", today(30)),
          newUsers7: await stat("SELECT COUNT(*) n FROM users WHERE created_at >= ?", now() - 7 * 86400000),
        },
      });
    }
    if ((m = p.match(/^\/api\/admin\/quizzes\/([\w]{6,20})$/)) && method === "POST") {
      const { action } = await body(request);
      const set = { approve: "ok", restore: "ok", hide: "hidden" }[action];
      if (set) await DB.prepare("UPDATE quizzes SET status = ? WHERE id = ?").bind(set, m[1]).run();
      if (action === "restore" || action === "dismiss" || action === "approve") {
        await DB.batch([DB.prepare("UPDATE reports SET status = 'closed' WHERE quiz_id = ?").bind(m[1]), DB.prepare("UPDATE quizzes SET reports = 0 WHERE id = ?").bind(m[1])]);
      }
      if (action === "hide") await DB.prepare("UPDATE reports SET status = 'closed' WHERE quiz_id = ?").bind(m[1]).run();
      return json({ ok: true });
    }
    if ((m = p.match(/^\/api\/admin\/users\/([\w]{6,20})$/)) && method === "POST") {
      const { action } = await body(request);
      if (action === "suspend") await DB.batch([DB.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").bind(m[1]), DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(m[1]),
        DB.prepare("UPDATE quizzes SET status = 'hidden' WHERE owner_id = ? AND visibility = 'public'").bind(m[1])]);
      if (action === "restore") await DB.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(m[1]).run();
      return json({ ok: true });
    }
  }

  return fail("Not found", 404);
}

const modeOf = (quiz) => (quiz.questions.some((q) => q.type === "quiz") ? "play" : "pulse");

async function ipHash(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`kalakal-report:${ip}`));
  return [...new Uint8Array(buf).slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deleteUser(env, userId) {
  const DB = await db(env);
  if (env.MEDIA) {
    let cursor;
    do {
      const list = await env.MEDIA.list({ prefix: `u/${userId}/`, cursor });
      if (list.objects.length) await env.MEDIA.delete(list.objects.map((o) => o.key));
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
  }
  const ids = (await DB.prepare("SELECT id FROM quizzes WHERE owner_id = ?").bind(userId).all()).results.map((r) => r.id);
  const stmts = [
    DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    DB.prepare("DELETE FROM likes WHERE user_id = ?").bind(userId),
    DB.prepare("DELETE FROM media WHERE owner_id = ?").bind(userId),
    DB.prepare("DELETE FROM reports WHERE reporter = ?").bind(userId),
    DB.prepare("DELETE FROM quizzes WHERE owner_id = ?").bind(userId),
    DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ];
  for (const id of ids) stmts.push(DB.prepare("DELETE FROM plays_daily WHERE quiz_id = ?").bind(id), DB.prepare("DELETE FROM likes WHERE quiz_id = ?").bind(id), DB.prepare("DELETE FROM reports WHERE quiz_id = ?").bind(id));
  for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
}
