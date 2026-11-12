// Kalakal: live quiz server.
// One Worker serves the static site (public/) and the API.
// Each game PIN maps to one GameRoom Durable Object that holds the live game.

import { DurableObject } from "cloudflare:workers";

const MAX_PLAYERS = 200;
const MAX_QUESTIONS = 50;
const NAME_MAX = 16;
const COLORS = ["#FFB627", "#19D3C5", "#FF5D73", "#A78BFA"];
// Short starter list; extend as needed. Matched as whole words, case-insensitive.
const BLOCKED = ["fuck", "shit", "bitch", "cunt", "dick", "pussy", "nigger", "nigga", "whore", "slut", "fag", "rape", "nazi", "hitler", "porn", "sex"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Create a game: POST /api/games  { quiz }
    if (url.pathname === "/api/games" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      const quiz = validateQuiz(body && body.quiz);
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

    // Check a PIN: GET /api/games/123456
    let m = url.pathname.match(/^\/api\/games\/(\d{6})$/);
    if (m && request.method === "GET") {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      return stub.fetch("https://room/status");
    }

    // Live connection: GET /ws/123456?role=host|player  (WebSocket upgrade)
    m = url.pathname.match(/^\/ws\/(\d{6})$/);
    if (m) {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return new Response("Not found", { status: 404 });
  },
};

// ---------- validation helpers ----------
function clean(s, max) {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function validateQuiz(q) {
  if (!q || typeof q !== "object") return { error: "Missing quiz" };
  const title = clean(q.title, 80) || "Kalakal quiz";
  if (!Array.isArray(q.questions) || q.questions.length === 0) return { error: "Add at least one question" };
  if (q.questions.length > MAX_QUESTIONS) return { error: `Max ${MAX_QUESTIONS} questions` };
  const questions = [];
  for (const [i, item] of q.questions.entries()) {
    const text = clean(item && item.text, 200);
    if (!text) return { error: `Question ${i + 1} has no text` };
    const answers = (Array.isArray(item.answers) ? item.answers : []).map((a) => clean(a, 80)).filter(Boolean);
    if (answers.length < 2 || answers.length > 4) return { error: `Question ${i + 1} needs 2 to 4 answers` };
    const correct = Number(item.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct >= answers.length) return { error: `Question ${i + 1} has no correct answer` };
    const time = Math.min(120, Math.max(5, Number(item.time) || 20));
    questions.push({ text, answers, correct, time });
  }
  return { value: { title, questions } };
}

function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, "");
}

function cleanName(raw) {
  const name = clean(raw, NAME_MAX);
  if (name.length < 2) return { error: "Pick a nickname with at least 2 characters" };
  const lower = name.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/);
  const squashed = lower.replace(/[^a-z]/g, "");
  if (BLOCKED.some((w) => words.includes(w) || (w.length >= 4 && squashed.includes(w)))) return { error: "Please choose a friendlier nickname" };
  return { value: name };
}

// ---------- the live game ----------
export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.setup = null;         // { pin, quiz, hostKey, createdAt }
    this.players = new Map();  // pid -> { id, name, color, score, streak, socket, connected, answers: {} }
    this.hosts = new Set();
    this.phase = "lobby";      // lobby | question | reveal | leaderboard | podium
    this.qIndex = -1;
    this.qStartedAt = 0;
    this.timer = null;
    this.locked = false;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.setup = (await ctx.storage.get("setup")) || null;
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/init") {
      const fresh = this.setup && Date.now() - this.setup.createdAt < 6 * 3600 * 1000;
      if (fresh) return new Response("PIN in use", { status: 409 });
      const { pin, quiz, hostKey } = await request.json();
      this.setup = { pin, quiz, hostKey, createdAt: Date.now() };
      this.players.clear(); this.phase = "lobby"; this.qIndex = -1; this.locked = false;
      await this.ctx.storage.put("setup", this.setup);
      return new Response("ok");
    }

    if (url.pathname === "/status") {
      if (!this.setup) return json({ exists: false });
      return json({ exists: true, phase: this.phase, locked: this.locked, players: this.players.size });
    }

    // WebSocket
    if (!this.setup) return new Response("No such game", { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const role = url.searchParams.get("role") === "host" ? "host" : "player";
    if (role === "host") this.acceptHost(server);
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
        // Rejoin with an existing player id (refresh / dropped Wi-Fi)
        if (msg.pid && this.players.has(msg.pid)) {
          player = this.players.get(msg.pid);
          if (player.socket && player.socket !== ws) { try { player.socket.close(4000, "replaced"); } catch {} }
          player.socket = ws; player.connected = true;
          this.send(ws, { t: "joined", pid: player.id, name: player.name, color: player.color });
          this.send(ws, this.playerSnapshot(player));
          this.broadcastLobby();
          return;
        }
        if (this.locked) { this.send(ws, { t: "error", message: "This game is locked. Ask the host to unlock it." }); return; }
        if (this.phase === "podium") { this.send(ws, { t: "error", message: "This game has finished." }); return; }
        if (this.players.size >= MAX_PLAYERS) { this.send(ws, { t: "error", message: "This game is full." }); return; }
        const n = cleanName(msg.name);
        if (n.error) { this.send(ws, { t: "error", message: n.error }); return; }
        let name = n.value, k = 2;
        const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
        while (taken.has(name.toLowerCase())) name = `${n.value.slice(0, NAME_MAX - 3)} ${k++}`;
        const id = randomToken();
        player = { id, name, color: COLORS[this.players.size % COLORS.length], score: 0, streak: 0, socket: ws, connected: true, answers: {} };
        this.players.set(id, player);
        this.send(ws, { t: "joined", pid: id, name, color: player.color });
        this.send(ws, this.playerSnapshot(player));
        this.broadcastLobby();
        return;
      }
      if (msg.t === "answer") this.onAnswer(player, msg);
    });
    const drop = () => {
      if (player && player.socket === ws) { player.connected = false; this.broadcastLobby(); }
    };
    ws.addEventListener("close", drop); ws.addEventListener("error", drop);
  }

  // ----- host controls -----
  onHostMessage(msg) {
    const quiz = this.setup.quiz;
    switch (msg.t) {
      case "start":
        if (this.phase === "lobby" && this.players.size > 0) this.startQuestion(0);
        break;
      case "next":
        if (this.phase === "reveal") this.showLeaderboard();
        else if (this.phase === "leaderboard") {
          if (this.qIndex + 1 < quiz.questions.length) this.startQuestion(this.qIndex + 1);
          else this.showPodium();
        }
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
      case "end":
        this.showPodium();
        break;
    }
  }

  // ----- game flow -----
  startQuestion(i) {
    const q = this.setup.quiz.questions[i];
    this.phase = "question"; this.qIndex = i; this.qStartedAt = Date.now();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reveal(), q.time * 1000 + 300);
    const base = { t: "question", index: i, total: this.setup.quiz.questions.length, text: q.text, answers: q.answers, time: q.time, remaining: q.time * 1000 };
    this.toHosts({ ...base, answered: 0, players: this.players.size });
    this.toPlayers(() => base);
  }

  onAnswer(p, msg) {
    if (this.phase !== "question" || msg.q !== this.qIndex || p.answers[this.qIndex]) return;
    const q = this.setup.quiz.questions[this.qIndex];
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
    const q = this.setup.quiz.questions[this.qIndex];
    const counts = q.answers.map(() => 0);
    for (const p of this.players.values()) {
      const a = p.answers[this.qIndex];
      if (a) counts[a.choice]++;
      if (a && a.choice === q.correct) {
        // Up to 1000 points for speed (never below 500 for a right answer), plus a streak bonus.
        const speed = 1 - a.elapsed / (q.time * 1000) / 2;
        p.streak += 1;
        const bonus = Math.min(500, (p.streak - 1) * 100);
        a.points = Math.round(1000 * speed) + bonus;
        p.score += a.points;
      } else {
        p.streak = 0;
        if (a) a.points = 0;
      }
    }
    const ranked = this.ranked();
    this.toHosts({ t: "reveal", index: this.qIndex, correct: q.correct, counts, text: q.text, answers: q.answers, last: this.qIndex + 1 >= this.setup.quiz.questions.length });
    ranked.forEach((p, idx) => {
      const a = p.answers[this.qIndex];
      this.toPlayer(p, { t: "result", answered: !!a, correct: !!a && a.choice === q.correct, points: a ? a.points : 0, score: p.score, streak: p.streak, rank: idx + 1, players: ranked.length, correctText: q.answers[q.correct] });
    });
  }

  showLeaderboard() {
    this.phase = "leaderboard";
    const top = this.ranked().slice(0, 5).map((p) => ({ name: p.name, score: p.score, streak: p.streak, color: p.color }));
    this.toHosts({ t: "leaderboard", top, index: this.qIndex, total: this.setup.quiz.questions.length, last: this.qIndex + 1 >= this.setup.quiz.questions.length });
  }

  showPodium() {
    clearTimeout(this.timer);
    this.phase = "podium";
    const ranked = this.ranked();
    this.toHosts({ t: "podium", top: ranked.slice(0, 3).map((p) => ({ name: p.name, score: p.score, color: p.color })), players: ranked.length, results: ranked.map((p, i) => ({ rank: i + 1, name: p.name, score: p.score })) });
    ranked.forEach((p, idx) => this.toPlayer(p, { t: "final", rank: idx + 1, score: p.score, players: ranked.length }));
  }

  ranked() {
    return [...this.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  broadcastLobby() {
    const list = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, connected: p.connected }));
    this.toHosts({ t: "lobby", players: list, locked: this.locked });
    if (this.phase === "lobby") this.toPlayers(() => ({ t: "lobby_wait", players: list.length }));
  }

  // State for a host who connects or reconnects
  hostSnapshot() {
    const quiz = this.setup.quiz;
    const players = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, connected: p.connected }));
    const snap = { t: "snapshot", pin: this.setup.pin, title: quiz.title, total: quiz.questions.length, phase: this.phase, players, locked: this.locked };
    if (this.phase === "question") {
      const q = quiz.questions[this.qIndex];
      snap.question = { index: this.qIndex, text: q.text, answers: q.answers, time: q.time, remaining: Math.max(0, q.time * 1000 - (Date.now() - this.qStartedAt)), answered: players.filter((x) => this.players.get(x.id).answers[this.qIndex]).length };
    }
    return snap;
  }

  // State for a player who joins or rejoins mid-game
  playerSnapshot(p) {
    if (this.phase === "question") {
      const q = this.setup.quiz.questions[this.qIndex];
      return { t: "question", index: this.qIndex, total: this.setup.quiz.questions.length, text: q.text, answers: q.answers, time: q.time, remaining: Math.max(0, q.time * 1000 - (Date.now() - this.qStartedAt)), alreadyAnswered: !!p.answers[this.qIndex] };
    }
    if (this.phase === "podium") {
      const ranked = this.ranked();
      return { t: "final", rank: ranked.indexOf(p) + 1, score: p.score, players: ranked.length };
    }
    if (this.phase === "lobby") return { t: "lobby_wait", players: this.players.size };
    return { t: "between", score: p.score, streak: p.streak };
  }
}
