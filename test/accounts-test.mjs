// Accounts, saved quizzes, library, moderation, pictures and privacy rules.
// Needs `npm run dev` (local test sign-in, local database and picture storage).
// Usage: node test/accounts-test.mjs [baseUrl]
const BASE = process.argv[2] || "http://localhost:8787";
const WS = BASE.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const ok = (m) => console.log("  ok -", m);
const run = Date.now().toString(36);

async function login(email, name) {
  const r = await fetch(`${BASE}/auth/dev?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`, { redirect: "manual" });
  const c = (r.headers.get("set-cookie") || "").split(";")[0];
  if (!c.startsWith("kk_session=")) fail("no session cookie for " + email);
  const call = async (path, { method = "GET", body, raw, type, origin } = {}) => {
    const headers = { cookie: c };
    if (body) headers["content-type"] = "application/json";
    if (raw) headers["content-type"] = type;
    if (origin) headers.origin = origin;
    const res = await fetch(BASE + path, { method, headers, body: raw || (body ? JSON.stringify(body) : undefined) });
    let data = {}; try { data = await res.json(); } catch { /* not json */ }
    return { ...data, quizStatus: data.status, status: res.status };
  };
  return { cookie: c, call };
}
const anon = async (path, opts = {}) => { const r = await fetch(BASE + path, opts); let d = {}; try { d = await r.json(); } catch { /* */ } return { ...d, quizStatus: d.status, status: r.status }; };

const me0 = await anon("/api/me");
if (!me0.dev) fail("needs the local dev server (npm run dev)");
const quiz = (title, extra = {}) => ({ title, questions: [
  { type: "quiz", text: "Which planet is red?", answers: ["Mars", "Venus", "Earth"], correct: 0, time: 20, ...extra },
  { type: "quiz", text: "How many legs does a spider have?", answers: ["Six", "Eight"], correct: [1], time: 15 },
  { type: "poll", text: "Favourite planet?", answers: ["Mars", "Saturn"] },
] });

// ---- sign-in, terms ----
const asha = await login(`asha-${run}@test.local`, "Asha");
let r = await asha.call("/api/me");
if (!r.user || r.user.name !== "Asha" || r.user.acceptedTerms) fail("me after login " + JSON.stringify(r));
r = await asha.call("/api/quizzes", { method: "POST", body: { quiz: quiz("Space"), meta: {} } });
if (r.status !== 403 || !r.needsTerms) fail("saving before accepting terms should be refused");
await asha.call("/api/me", { method: "POST", body: { acceptTerms: true, displayName: "Asha K" } });
ok("sign-in works; saving needs the 13+/terms step first");

// ---- save, list, private ----
r = await asha.call("/api/quizzes", { method: "POST", body: { quiz: quiz(`Space ${run}`, { media: { kind: "image", src: "data:image/png;base64,AAAA" } }), meta: { category: "science", visibility: "private" } } });
if (r.status !== 200 || !r.id) fail("save " + JSON.stringify(r));
const spaceId = r.id;
r = await asha.call(`/api/quizzes/${spaceId}`);
if (r.quiz.questions[0].media) fail("browser-only picture (data URL) was stored on the server");
const list = await asha.call("/api/quizzes");
if (!list.quizzes.some((q) => q.id === spaceId && q.visibility === "private")) fail("my quizzes list");
r = await anon(`/api/library/${spaceId}`);
if (r.status !== 404) fail("private quiz visible to others");
ok("save to My quizzes; private quizzes stay private; browser-only pictures aren't uploaded by accident");

// ---- pictures ----
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
r = await asha.call("/api/media", { method: "POST", raw: png, type: "image/png" });
if (!r.src || !r.src.startsWith("/media/u/")) fail("upload " + JSON.stringify(r));
const pic = await fetch(BASE + r.src);
if (pic.status !== 200 || pic.headers.get("content-type") !== "image/png") fail("serve picture");
r = await asha.call("/api/media", { method: "POST", raw: new TextEncoder().encode("<svg/>"), type: "image/svg+xml" });
if (r.status !== 400) fail("SVG upload accepted");
const picSrc = (await asha.call("/api/media", { method: "POST", raw: png, type: "image/png" })).src;
ok("picture upload and serving; SVG (script risk) refused");

// ---- publish: first public quiz waits for approval ----
r = await asha.call(`/api/quizzes/${spaceId}`, { method: "PUT", body: { quiz: quiz(`Space ${run}`, { media: { kind: "image", src: picSrc } }), meta: { category: "science", visibility: "public", description: "Planets for kids" } } });
if (r.status !== 200 || r.quizStatus !== "review" || r.visibility !== "public") fail("publish " + JSON.stringify(r));
if ((await asha.call(`/api/quizzes/${spaceId}`)).quizStatus !== "review") fail("first public quiz should wait for review");
let lib = await anon(`/api/library?q=${run}`);
if (lib.quizzes.length) fail("quiz in library before approval");
const rude = await asha.call("/api/quizzes", { method: "POST", body: { quiz: { ...quiz("shit quiz") }, meta: { visibility: "public" } } });
if (rude.status !== 400) fail("rude public quiz accepted");
ok("a new creator's first public quiz waits for approval; blocked words can't go public");

// ---- admin approves ----
const admin = await login("admin@test.local", "Admin");
await admin.call("/api/me", { method: "POST", body: { acceptTerms: true } });
r = await asha.call("/api/admin/overview");
if (r.status !== 404) fail("non-admin reached admin API");
r = await admin.call("/api/admin/overview");
if (!r.review || !r.review.some((q) => q.id === spaceId)) fail("admin queue missing quiz");
await admin.call(`/api/admin/quizzes/${spaceId}`, { method: "POST", body: { action: "approve" } });
lib = await anon(`/api/library?q=${run}`);
if (!lib.quizzes.some((q) => q.id === spaceId && q.cover === picSrc && q.creator.name === "Asha K")) fail("library after approval " + JSON.stringify(lib.quizzes));
const details = await anon(`/api/library/${spaceId}`);
if (JSON.stringify(details).includes("Venus") || JSON.stringify(details).includes("\"correct\"")) fail("library page leaks answers");
if (details.preview.length !== 3) fail("preview");
ok("admin approves; quiz appears in the library with cover and creator; answers never sent to the public page");

// ---- second public quiz goes live straight away ----
r = await asha.call("/api/quizzes", { method: "POST", body: { quiz: quiz(`Oceans ${run}`), meta: { category: "science", visibility: "public" } } });
if (r.status !== 200 || r.quizStatus !== "ok") fail("second quiz " + JSON.stringify(r));
if ((await asha.call(`/api/quizzes/${r.id}`)).quizStatus !== "ok") fail("second public quiz should be live");
const oceansId = r.id;
ok("after the first approval, the creator's next public quizzes go live after the automatic checks");

// ---- other users: authorisation, copy, like ----
const bo = await login(`bo-${run}@test.local`, "Bo");
await bo.call("/api/me", { method: "POST", body: { acceptTerms: true } });
r = await bo.call(`/api/quizzes/${spaceId}`, { method: "PUT", body: { quiz: quiz("Hacked"), meta: {} } });
if (r.status !== 404) fail("another user could edit the quiz");
r = await bo.call(`/api/quizzes/${spaceId}`, { method: "DELETE" });
if (r.status !== 404) fail("another user could delete the quiz");
r = await bo.call(`/api/quizzes/${spaceId}`);
if (r.status !== 404) fail("another user could read the full quiz with answers");
r = await bo.call(`/api/quizzes/${spaceId}/copy`, { method: "POST" });
if (!r.id) fail("copy");
const copy = await bo.call(`/api/quizzes/${r.id}`);
if (copy.visibility !== "private" || copy.copiedFrom !== spaceId || copy.quiz.questions.length !== 3) fail("copy content");
r = await bo.call(`/api/quizzes/${spaceId}/like`, { method: "POST" });
if (!r.liked || r.likes !== 1) fail("like");
r = await bo.call(`/api/quizzes/${spaceId}/like`, { method: "POST" });
if (r.liked || r.likes !== 0) fail("unlike");
r = await anon(`/api/quizzes/${spaceId}/like`, { method: "POST" });
if (r.status !== 401) fail("anonymous like");
ok("others can't edit, delete or read answers; they can copy (private copy) and like");

// ---- cross-site request blocked ----
r = await asha.call("/api/quizzes", { method: "POST", origin: "https://evil.example", body: { quiz: quiz("x"), meta: {} } });
if (r.status !== 403) fail("cross-site POST allowed");
ok("requests from other websites are refused");

// ---- hosting a library quiz and counting plays ----
r = await anon("/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quizId: spaceId }) });
if (!r.pin) fail("host from library " + JSON.stringify(r));
const { pin, hostKey } = r;
const sock = (url) => new Promise((res, rej) => { const w = new WebSocket(url); w.onopen = () => res(w); w.onerror = () => rej(new Error(url)); });
const host = await sock(`${WS}/ws/${pin}?role=host`); const HM = [];
host.onmessage = (e) => HM.push(JSON.parse(e.data)); host.send(JSON.stringify({ t: "host_hello", key: hostKey }));
const PM = [];
for (let i = 0; i < 3; i++) {
  const p = await sock(`${WS}/ws/${pin}?role=player`);
  p.onmessage = (e) => { const m = JSON.parse(e.data); if (i === 0) PM.push(m); if (m.t === "question") setTimeout(() => p.send(JSON.stringify({ t: "answer", q: m.index, choice: 0 })), 100); };
  p.send(JSON.stringify({ t: "join", name: `P${i}`, avatar: i }));
}
await sleep(500);
host.send(JSON.stringify({ t: "start" })); await sleep(600);
const q0 = PM.find((m) => m.t === "question");
if (!q0 || !q0.media || q0.media.src !== picSrc) fail("phone didn't get the stored picture");
host.send(JSON.stringify({ t: "end" })); await sleep(800);
lib = await anon(`/api/library/${spaceId}`);
if (lib.plays !== 1) fail("play not counted: " + lib.plays);
ok("anyone can host a library quiz; phones get its pictures; a finished game with 3+ players counts one play");
host.close();

// ---- reports hide a quiz after 3 ----
for (const who of [bo, await login(`c-${run}@test.local`, "C"), await login(`d-${run}@test.local`, "D")]) {
  await who.call(`/api/quizzes/${oceansId}/report`, { method: "POST", body: { reason: "wrong", note: "Answer 2 is wrong" } });
}
await bo.call(`/api/quizzes/${oceansId}/report`, { method: "POST", body: { reason: "spam" } });   // same person again: ignored
lib = await anon(`/api/library?q=Oceans%20${run}`);
if (lib.quizzes.length) fail("quiz not hidden after 3 reports");
r = await admin.call("/api/admin/overview");
const rep = r.reported.find((q) => q.id === oceansId);
if (!rep || rep.reportList.length !== 3) fail("admin report list");
await admin.call(`/api/admin/quizzes/${oceansId}`, { method: "POST", body: { action: "restore" } });
lib = await anon(`/api/library?q=Oceans%20${run}`);
if (!lib.quizzes.length) fail("restore");
ok("3 reports from different people hide a quiz; admin sees the reasons and can restore it");

// ---- export and delete account ----
r = await asha.call("/api/me/export");
if (!r.account || r.quizzes.length < 2 || !r.pictures.length) fail("export");
r = await asha.call("/api/me", { method: "DELETE", body: { confirm: "nope" } });
if (r.status !== 400) fail("delete without confirmation");
r = await asha.call("/api/me", { method: "DELETE", body: { confirm: "DELETE" } });
if (!r.ok) fail("delete account");
if ((await asha.call("/api/me")).user) fail("still signed in after delete");
if ((await anon(`/api/library/${spaceId}`)).status !== 404) fail("quiz still public after account delete");
if ((await fetch(BASE + picSrc)).status !== 404) fail("picture still served after account delete");
ok("download my data; delete account removes the account, quizzes and pictures, and signs out");
console.log("PASS: accounts and library");
process.exit(0);
