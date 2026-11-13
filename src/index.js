// Kalakal: live quiz + audience interaction server.
// One Worker serves the static site (public/) and the API.
// Each game PIN maps to one GameRoom Durable Object that holds the live session.
//
// A session is a list of slides. Slide types:
//   quiz      - question with a correct answer, timer, points       (Kalakal Play)
//   poll      - multiple choice, live bar chart, no right answer    (Kalakal Kural)
//   wordcloud - short words, bigger the more people send them
//   open      - free-text answers shown as cards
//   scale     - rate 1-4 statements from 1 to 5
//   qa        - audience asks questions and upvotes each other's

import { DurableObject } from "cloudflare:workers";
import { FUN_NAMES, funName } from "../public/js/names.js";
import { AVATAR_COUNT } from "../public/js/avatar.js";

const MAX_PLAYERS = 200;
const MAX_SLIDES = 50;
const NAME_MAX = 16;
const COLORS = ["#FFB627", "#19D3C5", "#FF5D73", "#A78BFA"];
const TYPES = ["quiz", "poll", "wordcloud", "open", "scale", "qa"];
const LIMITS = { wordcloud: 3, open: 3, qa: 5 };           // submissions per person per slide
const TEXT_MAX = { wordcloud: 25, open: 200, qa: 200 };
const MAX_ITEMS = 2000;                                     // cap stored text items per slide
// Short starter list; extend as needed. Matched as whole words (or inside squashed text for longer words).
const BLOCKED = ["fuck", "fucking", "shit", "bitch", "cunt", "dick", "pussy", "nigger", "nigga", "whore", "slut", "fag", "rape", "nazi", "hitler", "porn", "sex", "asshole", "bastard"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/games" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      const quiz = validateSession(body && body.quiz);
      if (quiz.error) return json({ error: quiz.error }, 400);
      const hostKey = randomToken();
      for (let attempt = 0; attempt < 8; attempt++) {
        const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
        const stub = env.ROOMS.get(env.ROOMS.idFromName(pin));
        const res = await stub.fetch("https://room/init", { method: "POST", body: JSON.stringify({ pin, quiz: quiz.value, hostKey }) });
        if (res.status === 200) return json({ pin, hostKey });
      }
      return json({ error: "Could not allocate a PIN, try again" }, 503);
    }

    let m = url.pathname.match(/^\/api\/games\/(\d{6})$/);
    if (m && request.method === "GET") {
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch("https://room/status");
    }

    m = url.pathname.match(/^\/ws\/(\d{6})$/);
    if (m) {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(request);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return new Response("Not found", { status: 404 });
  },
};

// ---------- validation helpers ----------
function clean(s, max) {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isRude(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/);
  const squashed = lower.replace(/[^a-z]/g, "");
  return BLOCKED.some((w) => words.includes(w) || (w.length >= 5 && squashed.includes(w)));
}

function validateSession(q) {
  if (!q || typeof q !== "object") return { error: "Missing quiz" };
  const title = clean(q.title, 80) || "Kalakal session";
  if (!Array.isArray(q.questions) || q.questions.length === 0) return { error: "Add at least one slide" };
  if (q.questions.length > MAX_SLIDES) return { error: `Max ${MAX_SLIDES} slides` };
  const slides = [];
  for (const [i, item] of q.questions.entries()) {
    const n = i + 1;
    const type = TYPES.includes(item && item.type) ? item.type : "quiz";
    const text = clean(item && item.text, 200);
    if (!text) return { error: `Slide ${n} has no question text` };
    if (type === "quiz" || type === "poll") {
      const answers = (Array.isArray(item.answers) ? item.answers : []).map((a) => clean(a, 80)).filter(Boolean);
      if (answers.length < 2 || answers.length > 4) return { error: `Slide ${n} needs 2 to 4 answers` };
      if (type === "quiz") {
        const correct = Number(item.correct);
        if (!Number.isInteger(correct) || correct < 0 || correct >= answers.length) return { error: `Slide ${n} has no correct answer` };
        const time = Math.min(120, Math.max(5, Number(item.time) || 20));
        slides.push({ type, text, answers, correct, time });
      } else slides.push({ type, text, answers });
    } else if (type === "scale") {
      const statements = (Array.isArray(item.statements) ? item.statements : []).map((s) => clean(s, 80)).filter(Boolean).slice(0, 4);
      if (!statements.length) return { error: `Slide ${n} needs at least one statement to rate` };
      slides.push({ type, text, statements, low: clean(item.low, 24) || "Disagree", high: clean(item.high, 24) || "Agree" });
    } else slides.push({ type, text });
  }
  return { value: { title, questions: slides } };
}

function validAvatar(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < AVATAR_COUNT ? n : Math.floor(Math.random() * AVATAR_COUNT);
}

function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, "");
}

function cleanName(raw) {
  const name = clean(raw, NAME_MAX);
  if (name.length < 2) return { error: "Pick a nickname with at least 2 characters" };
  if (isRude(name)) return { error: "Please choose a friendlier nickname" };
  return { value: name };
}

// ---------- the live session ----------
export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.setup = null;         // { pin, quiz, hostKey, createdAt }
    this.players = new Map();  // pid -> { id, name, color, score, streak, socket, connected, answers: {} }
    this.hosts = new Set();
    this.phase = "lobby";      // lobby | question | reveal | leaderboard | engage | podium | finished
    this.qIndex = -1;          // current slide
    this.qStartedAt = 0;
    this.timer = null;
    this.locked = false;
    this.funNames = false;    // players get a random fun name instead of typing one
    this.quizDone = 0;        // quiz questions revealed so far
    this.highlights = [];     // milestone moments from the last reveal (for the host)
    this.responses = {};       // slide index -> response store (interaction slides)
    this.pushTimer = null;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.setup = (await ctx.storage.get("setup")) || null;
    });
  }

  get slides() { return this.setup.quiz.questions; }
  get slide() { return this.slides[this.qIndex]; }
  get hasQuiz() { return this.slides.some((s) => s.type === "quiz"); }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/init") {
      const fresh = this.setup && Date.now() - this.setup.createdAt < 6 * 3600 * 1000;
      if (fresh) return new Response("PIN in use", { status: 409 });
      const { pin, quiz, hostKey } = await request.json();
      this.setup = { pin, quiz, hostKey, createdAt: Date.now() };
      this.players.clear(); this.phase = "lobby"; this.qIndex = -1; this.locked = false; this.funNames = false; this.quizDone = 0; this.highlights = []; this.responses = {};
      await this.ctx.storage.put("setup", this.setup);
      return new Response("ok");
    }

    if (url.pathname === "/status") {
      if (!this.setup) return json({ exists: false });
      return json({ exists: true, phase: this.phase, locked: this.locked, funNames: this.funNames, players: this.players.size });
    }

    if (!this.setup) return new Response("No such game", { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    if (url.searchParams.get("role") === "host") this.acceptHost(server);
    else this.acceptPlayer(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ----- sockets -----
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch {} }
  toHosts(msg) { for (const h of this.hosts) this.send(h, msg); }
  toPlayer(p, msg) { if (p.socket && p.connected) this.send(p.socket, msg); }
  toPlayers(fn) { for (const p of this.players.values()) this.toPlayer(p, fn(p)); }

  acceptHost(ws) {
    let authed = false;
    ws.addEventListener("message", (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (!authed) {
        if (msg.t === "host_hello" && msg.key === this.setup.hostKey) {
          authed = true; this.hosts.add(ws);
          this.send(ws, this.hostSnapshot());
        } else { this.send(ws, { t: "error", message: "Not the host of this game" }); ws.close(4001, "unauthorised"); }
        return;
      }
      this.onHostMessage(msg);
    });
    const drop = () => this.hosts.delete(ws);
    ws.addEventListener("close", drop); ws.addEventListener("error", drop);
  }

  acceptPlayer(ws) {
    let player = null;
    ws.addEventListener("message", (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (!player) {
        if (msg.t !== "join") return;
        if (msg.pid && this.players.has(msg.pid)) {
          player = this.players.get(msg.pid);
          if (player.socket && player.socket !== ws) { try { player.socket.close(4000, "replaced"); } catch {} }
          player.socket = ws; player.connected = true;
          this.send(ws, { t: "joined", pid: player.id, name: player.name, color: player.color, avatar: player.avatar });
          this.send(ws, this.playerSnapshot(player));
          this.broadcastLobby();
          return;
        }
        if (this.locked) { this.send(ws, { t: "error", message: "This game is locked. Ask the host to unlock it." }); return; }
        if (this.phase === "podium" || this.phase === "finished") { this.send(ws, { t: "error", message: "This session has finished." }); return; }
        if (this.players.size >= MAX_PLAYERS) { this.send(ws, { t: "error", message: "This game is full." }); return; }
        const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
        let base;
        if (this.funNames) base = FUN_NAMES.includes(msg.name) ? msg.name : funName(taken);
        else {
          const n = cleanName(msg.name);
          if (n.error) { this.send(ws, { t: "error", message: n.error }); return; }
          base = n.value;
        }
        let name = base, k = 2;
        while (taken.has(name.toLowerCase())) name = `${base.slice(0, NAME_MAX - 3)} ${k++}`;
        const id = randomToken();
        player = { id, name, color: COLORS[this.players.size % COLORS.length], avatar: validAvatar(msg.avatar), score: 0, streak: 0, best: 0, correct: 0, socket: ws, connected: true, answers: {} };
        this.players.set(id, player);
        this.send(ws, { t: "joined", pid: id, name, color: player.color, avatar: player.avatar });
        this.send(ws, this.playerSnapshot(player));
        this.broadcastLobby();
        return;
      }
      if (msg.t === "answer") this.onAnswer(player, msg);
      else if (msg.t === "avatar") { player.avatar = validAvatar(msg.avatar); this.send(ws, { t: "avatar_ok", avatar: player.avatar }); this.broadcastLobby(); }
      else if (msg.t === "respond") this.onRespond(player, msg);
    });
    const drop = () => { if (player && player.socket === ws) { player.connected = false; this.broadcastLobby(); } };
    ws.addEventListener("close", drop); ws.addEventListener("error", drop);
  }

  // ----- host controls -----
  onHostMessage(msg) {
    switch (msg.t) {
      case "start":
        if (this.phase === "lobby" && this.players.size > 0) this.startSlide(0);
        break;
      case "next":
        if (this.phase === "reveal") this.showLeaderboard();
        else if (this.phase === "leaderboard" || this.phase === "engage") this.advance();
        break;
      case "skip":
        if (this.phase === "question") this.reveal();
        break;
      case "kick": {
        const p = this.players.get(msg.id);
        if (p) {
          this.toPlayer(p, { t: "kicked" });
          try { p.socket && p.socket.close(4002, "removed"); } catch {}
          this.players.delete(msg.id);
          this.broadcastLobby();
        }
        break;
      }
      case "lock":
        this.locked = !!msg.locked; this.broadcastLobby();
        break;
      case "fun_names":
        this.funNames = !!msg.on; this.broadcastLobby();
        break;
      case "hide":       // hide an open-text card or Q&A question
      case "answered": { // mark a Q&A question as answered (toggle)
        const store = this.responses[this.qIndex];
        if (this.phase !== "engage" || !store || !store.items) break;
        const item = store.items.find((x) => x.id === msg.id);
        if (!item) break;
        if (msg.t === "hide") item.hidden = !item.hidden; else item.answered = !item.answered;
        this.pushResults(true);
        break;
      }
      case "end":
        this.showEnd();
        break;
    }
  }

  advance() {
    if (this.qIndex + 1 < this.slides.length) this.startSlide(this.qIndex + 1);
    else this.showEnd();
  }

  startSlide(i) {
    clearTimeout(this.timer);
    this.qIndex = i;
    if (this.slides[i].type === "quiz") return this.startQuestion(i);
    this.phase = "engage";
    if (!this.responses[i]) this.responses[i] = this.newStore(this.slides[i]);
    this.toHosts({ t: "engage", index: i, total: this.slides.length, slide: this.slides[i], results: this.results(i), players: this.players.size });
    this.toPlayers((p) => this.engageForPlayer(p));
  }

  // ----- quiz flow -----
  startQuestion(i) {
    const q = this.slides[i];
    this.phase = "question"; this.qStartedAt = Date.now();
    this.timer = setTimeout(() => this.reveal(), q.time * 1000 + 300);
    const base = { t: "question", index: i, total: this.slides.length, text: q.text, answers: q.answers, time: q.time, remaining: q.time * 1000 };
    this.toHosts({ ...base, answered: 0, players: this.players.size });
    this.toPlayers(() => base);
  }

  onAnswer(p, msg) {
    if (this.phase !== "question" || msg.q !== this.qIndex || p.answers[this.qIndex]) return;
    const q = this.slide;
    const choice = Number(msg.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.answers.length) return;
    const elapsed = Math.min(Date.now() - this.qStartedAt, q.time * 1000);
    p.answers[this.qIndex] = { choice, elapsed };
    this.toPlayer(p, { t: "answer_ack", choice });
    const answered = [...this.players.values()].filter((x) => x.answers[this.qIndex]).length;
    this.toHosts({ t: "answer_count", answered, players: this.players.size });
    if (answered >= this.players.size) { clearTimeout(this.timer); this.timer = setTimeout(() => this.reveal(), 600); }
  }

  reveal() {
    if (this.phase !== "question") return;
    clearTimeout(this.timer);
    this.phase = "reveal";
    const q = this.slide;
    const counts = q.answers.map(() => 0);
    const prevRank = new Map(this.ranked().map((p, i) => [p.id, i + 1]));
    for (const p of this.players.values()) {
      const a = p.answers[this.qIndex];
      if (a) counts[a.choice]++;
      if (a && a.choice === q.correct) {
        const speed = 1 - a.elapsed / (q.time * 1000) / 2;
        p.streak += 1;
        a.points = Math.round(1000 * speed) + Math.min(500, (p.streak - 1) * 100);
        p.score += a.points; p.correct++; p.best = Math.max(p.best, p.streak);
      } else { p.streak = 0; if (a) a.points = 0; }
    }
    this.quizDone++;
    const ranked = this.ranked();
    // Milestones: celebrate streaks, taking the lead, entering the top 3 and big comebacks
    const ms = new Map();
    ranked.forEach((p, idx) => {
      const rank = idx + 1, before = prevRank.get(p.id) || rank, list = [];
      const a = p.answers[this.qIndex], right = !!a && a.choice === q.correct;
      if (right && (p.streak === 3 || p.streak === 5 || p.streak === 7 || (p.streak >= 10 && p.streak % 5 === 0))) list.push(`streak${p.streak}`);
      if (this.quizDone > 1 && p.score > 0) {
        if (rank === 1 && before !== 1 && ranked.length > 1) list.push("lead");
        else if (rank <= 3 && before > 3 && ranked.length > 3) list.push("top3");
        if (before - rank >= 3) list.push("comeback");
      }
      ms.set(p.id, list);
    });
    const order = (k) => (k === "lead" ? 0 : k.startsWith("streak") ? 1 : k === "top3" ? 2 : 3);
    this.highlights = ranked.flatMap((p) => (ms.get(p.id) || []).map((kind) => ({ name: p.name, avatar: p.avatar, kind, streak: p.streak })))
      .sort((x, y) => order(x.kind) - order(y.kind)).slice(0, 3);
    this.toHosts({ t: "reveal", index: this.qIndex, correct: q.correct, counts, text: q.text, answers: q.answers, last: this.qIndex + 1 >= this.slides.length });
    ranked.forEach((p, idx) => {
      const a = p.answers[this.qIndex];
      this.toPlayer(p, { t: "result", answered: !!a, correct: !!a && a.choice === q.correct, points: a ? a.points : 0, score: p.score, streak: p.streak, rank: idx + 1, players: ranked.length, correctText: q.answers[q.correct], milestones: (ms.get(p.id) || []).sort((x, y) => order(x) - order(y)) });
    });
  }

  showLeaderboard() {
    this.phase = "leaderboard";
    const top = this.ranked().slice(0, 5).map((p) => ({ name: p.name, score: p.score, streak: p.streak, color: p.color, avatar: p.avatar }));
    this.toHosts({ t: "leaderboard", top, highlights: this.highlights, index: this.qIndex, total: this.slides.length, last: this.qIndex + 1 >= this.slides.length });
  }

  showEnd() {
    clearTimeout(this.timer);
    const summary = this.summary();
    if (!this.hasQuiz) {
      this.phase = "finished";
      this.toHosts({ t: "finished", players: this.players.size, summary });
      this.toPlayers(() => ({ t: "thanks" }));
      return;
    }
    this.phase = "podium";
    const ranked = this.ranked();
    this.toHosts({ t: "podium", top: ranked.slice(0, 3).map((p) => ({ name: p.name, score: p.score, color: p.color, avatar: p.avatar })), players: ranked.length, results: ranked.map((p, i) => ({ rank: i + 1, name: p.name, score: p.score })), summary });
    const quizCount = this.slides.filter((x) => x.type === "quiz").length;
    ranked.forEach((p, idx) => this.toPlayer(p, { t: "final", rank: idx + 1, score: p.score, players: ranked.length, perfect: quizCount > 1 && p.correct === quizCount, best: p.best }));
  }

  ranked() {
    return [...this.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  // ----- interaction slides (Kalakal Kural) -----
  newStore(s) {
    if (s.type === "poll") return { counts: s.answers.map(() => 0), voters: new Map() };
    if (s.type === "scale") return { sums: s.statements.map(() => 0), dist: s.statements.map(() => [0, 0, 0, 0, 0]), voters: new Map() };
    if (s.type === "wordcloud") return { words: new Map(), per: new Map() };
    return { items: [], per: new Map(), seq: 0 }; // open, qa
  }

  onRespond(p, msg) {
    if (this.phase !== "engage" || msg.s !== this.qIndex) return;
    const s = this.slide, store = this.responses[this.qIndex];
    const reply = (extra) => this.toPlayer(p, { t: "respond_ack", s: this.qIndex, ...extra });

    if (s.type === "poll") {
      const choice = Number(msg.choice);
      if (!Number.isInteger(choice) || choice < 0 || choice >= s.answers.length) return;
      const prev = store.voters.get(p.id);
      if (prev !== undefined) store.counts[prev]--;          // allow changing your vote
      store.voters.set(p.id, choice); store.counts[choice]++;
      reply({ choice });
    } else if (s.type === "scale") {
      const vals = Array.isArray(msg.values) ? msg.values : [];
      if (vals.length !== s.statements.length) return;
      const nums = vals.map((v) => Number(v));
      if (nums.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) return;
      const prev = store.voters.get(p.id);
      if (prev) prev.forEach((v, k) => { store.sums[k] -= v; store.dist[k][v - 1]--; });
      nums.forEach((v, k) => { store.sums[k] += v; store.dist[k][v - 1]++; });
      store.voters.set(p.id, nums);
      reply({ values: nums });
    } else if (s.type === "wordcloud" || s.type === "open" || (s.type === "qa" && msg.ask !== undefined)) {
      const text = clean(s.type === "qa" ? msg.ask : msg.text, TEXT_MAX[s.type]);
      if (!text) return;
      if (isRude(text)) return this.toPlayer(p, { t: "respond_error", message: "Please keep it friendly." });
      const used = store.per.get(p.id) || 0;
      if (used >= LIMITS[s.type]) return this.toPlayer(p, { t: "respond_error", message: "You've used all your answers for this one." });
      store.per.set(p.id, used + 1);
      if (s.type === "wordcloud") {
        const key = text.toLowerCase();
        const w = store.words.get(key);
        if (w) w.count++; else if (store.words.size < MAX_ITEMS) store.words.set(key, { text, count: 1 });
      } else if (store.items.length < MAX_ITEMS) {
        store.items.push({ id: ++store.seq, text, votes: new Set(), hidden: false, answered: false, by: p.id });
      }
      reply({ left: LIMITS[s.type] - used - 1 });
    } else if (s.type === "qa" && msg.vote !== undefined) {
      const item = store.items.find((x) => x.id === Number(msg.vote));
      if (!item || item.hidden || item.by === p.id) return;
      if (item.votes.has(p.id)) item.votes.delete(p.id); else item.votes.add(p.id);  // toggle upvote
      reply({ vote: item.id, on: item.votes.has(p.id) });
    } else return;
    this.pushResults();
  }

  // Throttled live updates (at most ~4 per second)
  pushResults(now = false) {
    const send = () => {
      this.pushTimer = null;
      if (this.phase !== "engage") return;
      const i = this.qIndex, results = this.results(i);
      this.toHosts({ t: "results", index: i, results, players: this.players.size });
      if (this.slide.type === "qa") this.toPlayers(() => ({ t: "qa_list", s: i, items: this.qaPublic(i) }));
    };
    if (now) { clearTimeout(this.pushTimer); send(); return; }
    if (!this.pushTimer) this.pushTimer = setTimeout(send, 250);
  }

  results(i) {
    const s = this.slides[i], st = this.responses[i];
    if (!st) return null;
    if (s.type === "poll") return { counts: st.counts, responses: st.voters.size };
    if (s.type === "scale") return { averages: st.sums.map((sum) => (st.voters.size ? +(sum / st.voters.size).toFixed(2) : null)), dist: st.dist, responses: st.voters.size };
    if (s.type === "wordcloud") {
      const words = [...st.words.values()].sort((a, b) => b.count - a.count).slice(0, 60);
      return { words, responses: st.per.size };
    }
    const items = st.items.map((x) => ({ id: x.id, text: x.text, votes: x.votes.size, hidden: x.hidden, answered: x.answered }));
    if (s.type === "qa") items.sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.id - b.id);
    return { items, responses: st.per.size };
  }

  qaPublic(i) {
    return this.results(i).items.filter((x) => !x.hidden).map(({ id, text, votes, answered }) => ({ id, text, votes, answered }));
  }

  engageForPlayer(p) {
    const i = this.qIndex, s = this.slides[i], st = this.responses[i];
    const msg = { t: "engage", index: i, total: this.slides.length, slide: s };
    if (s.type === "poll") msg.mine = st.voters.has(p.id) ? st.voters.get(p.id) : null;
    if (s.type === "scale") msg.mine = st.voters.get(p.id) || null;
    if (st.per) msg.left = LIMITS[s.type] - (st.per.get(p.id) || 0);
    if (s.type === "qa") {
      msg.items = this.qaPublic(i);
      msg.myVotes = st.items.filter((x) => x.votes.has(p.id)).map((x) => x.id);
      msg.myItems = st.items.filter((x) => x.by === p.id).map((x) => x.id);
    }
    return msg;
  }

  summary() {
    return this.slides.map((s, i) => ({ type: s.type, text: s.text, answers: s.answers, statements: s.statements, results: s.type === "quiz" ? null : this.results(i) }));
  }

  broadcastLobby() {
    const list = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar, connected: p.connected }));
    this.toHosts({ t: "lobby", players: list, locked: this.locked, funNames: this.funNames });
    if (this.phase === "lobby") this.toPlayers(() => ({ t: "lobby_wait", players: list.length }));
  }

  hostSnapshot() {
    const players = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar, connected: p.connected }));
    const snap = { t: "snapshot", pin: this.setup.pin, title: this.setup.quiz.title, total: this.slides.length, phase: this.phase, players, locked: this.locked, funNames: this.funNames, mode: this.hasQuiz ? "play" : "kural" };
    if (this.phase === "question") {
      const q = this.slide;
      snap.question = { index: this.qIndex, text: q.text, answers: q.answers, time: q.time, remaining: Math.max(0, q.time * 1000 - (Date.now() - this.qStartedAt)), answered: [...this.players.values()].filter((p) => p.answers[this.qIndex]).length };
    }
    if (this.phase === "engage") snap.engage = { index: this.qIndex, total: this.slides.length, slide: this.slide, results: this.results(this.qIndex), players: players.length };
    return snap;
  }

  playerSnapshot(p) {
    if (this.phase === "question") {
      const q = this.slide;
      return { t: "question", index: this.qIndex, total: this.slides.length, text: q.text, answers: q.answers, time: q.time, remaining: Math.max(0, q.time * 1000 - (Date.now() - this.qStartedAt)), alreadyAnswered: !!p.answers[this.qIndex] };
    }
    if (this.phase === "engage") return this.engageForPlayer(p);
    if (this.phase === "podium") { const ranked = this.ranked(); return { t: "final", rank: ranked.indexOf(p) + 1, score: p.score, players: ranked.length, best: p.best }; }
    if (this.phase === "finished") return { t: "thanks" };
    if (this.phase === "lobby") return { t: "lobby_wait", players: this.players.size };
    return { t: "between", score: p.score, streak: p.streak };
  }
}
