// Characters, fun names and milestones test.
// Usage: node test/fun-test.mjs [baseUrl]
const BASE = process.argv[2] || "http://localhost:8787";
const WS = BASE.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const ok = (m) => console.log("  ok -", m);
const socket = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(ws); ws.onerror = () => rej(new Error(url)); });
const { FUN_NAMES } = await import(new URL("../public/js/names.js", import.meta.url));
const { AVATAR_COUNT } = await import(new URL("../public/js/avatar.js", import.meta.url));
if (FUN_NAMES.some((n) => n.length > 16)) fail("fun name too long"); ok(`${FUN_NAMES.length} fun names, all ≤ 16 chars; ${AVATAR_COUNT} avatar looks`);

const quiz = { title: "Fun", questions: Array.from({ length: 6 }, (_, i) => ({ text: `Q${i + 1}`, answers: ["A", "B"], correct: 0, time: 5 })) };
const { pin, hostKey } = await fetch(`${BASE}/api/games`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quiz }) }).then((r) => r.json());
const host = await socket(`${WS}/ws/${pin}?role=host`); const H = [];
host.onmessage = (e) => H.push(JSON.parse(e.data)); host.send(JSON.stringify({ t: "host_hello", key: hostKey }));
const hs = (m) => host.send(JSON.stringify(m));
await sleep(200);

async function bot(name, avatar, plan) {
  const ws = await socket(`${WS}/ws/${pin}?role=player`); const b = { ws, M: [], name };
  ws.onmessage = (e) => { const m = JSON.parse(e.data); b.M.push(m); if (m.t === "question") setTimeout(() => ws.send(JSON.stringify({ t: "answer", q: m.index, choice: plan(m.index) })), 100 + Math.random() * 300); };
  ws.send(JSON.stringify({ t: "join", name, avatar })); return b;
}
// Players: star always right; comeback wrong for 2 then right; others mixed
const bots = [];
bots.push(await bot("Star", 42, () => 0));
bots.push(await bot("Late Bloomer", 99999999, (i) => (i < 2 ? 1 : 0)));  // invalid avatar -> random
for (let i = 0; i < 6; i++) bots.push(await bot(`Mixed ${i}`, i, (q) => ((q + i) % 3 === 0 ? 1 : 0)));
await sleep(400);
const j0 = bots[0].M.find((m) => m.t === "joined"), j1 = bots[1].M.find((m) => m.t === "joined");
if (j0.avatar !== 42) fail("avatar not kept"); if (!(j1.avatar >= 0 && j1.avatar < AVATAR_COUNT)) fail("invalid avatar not replaced"); ok("avatars kept / invalid avatar replaced");
const lobby = [...H].reverse().find((m) => m.t === "lobby");
if (!lobby.players.every((p) => Number.isInteger(p.avatar))) fail("lobby missing avatars"); ok("host lobby shows every player's avatar");

// Fun names only: typed name ignored, fun name assigned; chosen fun name honoured
hs({ t: "fun_names", on: true }); await sleep(200);
const st = await fetch(`${BASE}/api/games/${pin}`).then((r) => r.json());
if (!st.funNames) fail("status missing funNames");
const f1 = await bot("Typed Name", 1, () => 0), f2 = await bot(FUN_NAMES[5], 2, () => 0);
await sleep(300);
const n1 = f1.M.find((m) => m.t === "joined").name, n2 = f2.M.find((m) => m.t === "joined").name;
if (!FUN_NAMES.includes(n1)) fail(`typed name allowed: ${n1}`); if (n2 !== FUN_NAMES[5]) fail("spun name not honoured");
ok(`fun names only: "Typed Name" became "${n1}", spun "${n2}" kept`);
bots.push(f1, f2);

// Avatar change in lobby
f1.ws.send(JSON.stringify({ t: "avatar", avatar: 7 })); await sleep(200);
if (!f1.M.find((m) => m.t === "avatar_ok" && m.avatar === 7)) fail("avatar change failed"); ok("players can change their look in the lobby");

hs({ t: "start" });
for (let q = 0; q < 6; q++) {
  const t0 = Date.now();
  while (!H.find((m) => m.t === "reveal" && m.index === q)) { if (Date.now() - t0 > 9000) fail("no reveal " + q); await sleep(50); }
  hs({ t: "next" }); await sleep(200); hs({ t: "next" }); await sleep(250);
}
await sleep(400);
const starRes = bots[0].M.filter((m) => m.t === "result");
const kinds = starRes.flatMap((m) => m.milestones);
if (!kinds.includes("streak3") || !kinds.includes("streak5")) fail("streak milestones missing: " + kinds); ok(`always-right player got: ${[...new Set(kinds)].join(", ")}`);
const boards = H.filter((m) => m.t === "leaderboard");
if (!boards.some((b) => b.highlights.length)) fail("no highlights for host"); ok(`host scoreboard highlights: ${boards.flatMap((b) => b.highlights.map((h) => `${h.name}:${h.kind}`)).slice(0, 5).join(", ")}`);
if (!boards[0].top.every((p) => Number.isInteger(p.avatar))) fail("board missing avatars"); ok("scoreboard rows carry avatars");
const fin = bots[0].M.find((m) => m.t === "final");
if (!fin.perfect || fin.best !== 6) fail("perfect game not flagged " + JSON.stringify(fin)); ok("perfect game + best streak sent to the winner");
const pod = H.find((m) => m.t === "podium");
if (!pod.top.every((p) => Number.isInteger(p.avatar))) fail("podium avatars"); ok("podium carries avatars");
console.log("PASS: characters, fun names and milestones");
process.exit(0);
