// Kalakal load test: one host + N bot players play a full game.
// Usage: node test/load-test.mjs [baseUrl] [players]
//   node test/load-test.mjs http://localhost:8787 25
const BASE = process.argv[2] || "http://localhost:8787";
const N = Number(process.argv[3] || 25);
const WS = BASE.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error("FAIL:", msg); process.exit(1); };

const quiz = {
  title: "Load test",
  questions: Array.from({ length: 5 }, (_, i) => ({ text: `Question ${i + 1}?`, answers: ["A", "B", "C", "D"], correct: i % 4, time: 6 })),
};

function socket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(new Error("ws error " + url));
  });
}

const res = await fetch(`${BASE}/api/games`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quiz }) });
const { pin, hostKey, error } = await res.json();
if (!pin) fail("create game: " + error);
console.log(`Game ${pin} created`);

// Bad input is rejected
const bad = await fetch(`${BASE}/api/games`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quiz: { questions: [{ text: "x", answers: ["only one"], correct: 0 }] } }) });
if (bad.status !== 400) fail("invalid quiz was accepted");

// Host
const host = await socket(`${WS}/ws/${pin}?role=host`);
const hostMsgs = [];
host.onmessage = (e) => hostMsgs.push(JSON.parse(e.data));
host.send(JSON.stringify({ t: "host_hello", key: hostKey }));

// Wrong host key is refused
const intruder = await socket(`${WS}/ws/${pin}?role=host`);
const intruderMsgs = [];
intruder.onmessage = (e) => intruderMsgs.push(JSON.parse(e.data));
intruder.send(JSON.stringify({ t: "host_hello", key: "nope" }));

// Players
const bots = [];
const t0 = Date.now();
await Promise.all(Array.from({ length: N }, async (_, i) => {
  const ws = await socket(`${WS}/ws/${pin}?role=player`);
  const bot = { ws, msgs: [], name: i === 0 ? "Spark Queen" : `Bot ${i}`, pid: null, accuracy: 0.3 + (i % 7) / 10 };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data); bot.msgs.push(m);
    if (m.t === "joined") bot.pid = m.pid;
    if (m.t === "question" && !m.alreadyAnswered) {
      setTimeout(() => {
        const choice = Math.random() < bot.accuracy ? quiz.questions[m.index].correct : (quiz.questions[m.index].correct + 1) % 4;
        ws.send(JSON.stringify({ t: "answer", q: m.index, choice }));
        ws.send(JSON.stringify({ t: "answer", q: m.index, choice: 0 })); // duplicate must be ignored
      }, 200 + Math.random() * 3000);
    }
  };
  ws.send(JSON.stringify({ t: "join", name: bot.name }));
  bots.push(bot);
}));
await sleep(800);
console.log(`${N} players joined in ${Date.now() - t0} ms`);

// Duplicate name gets a suffix; rude name refused
const dup = await socket(`${WS}/ws/${pin}?role=player`); const dupMsgs = [];
dup.onmessage = (e) => dupMsgs.push(JSON.parse(e.data)); dup.send(JSON.stringify({ t: "join", name: "Spark Queen" }));
const rude = await socket(`${WS}/ws/${pin}?role=player`); const rudeMsgs = [];
rude.onmessage = (e) => rudeMsgs.push(JSON.parse(e.data)); rude.send(JSON.stringify({ t: "join", name: "fuck you" }));
await sleep(500);
const dupName = dupMsgs.find((m) => m.t === "joined");
if (!dupName || dupName.name === "Spark Queen") fail("duplicate nickname not renamed");
if (!rudeMsgs.find((m) => m.t === "error")) fail("rude nickname accepted");
if (!intruderMsgs.find((m) => m.t === "error")) fail("wrong host key accepted");
// Host removes the duplicate player
host.send(JSON.stringify({ t: "kick", id: dupName.pid }));
await sleep(300);
if (!dupMsgs.find((m) => m.t === "kicked")) fail("kick did not reach player");

const lobby = hostMsgs.filter((m) => m.t === "lobby").pop();
if (!lobby || lobby.players.length !== N) fail(`host sees ${lobby && lobby.players.length} players, expected ${N}`);

// Simulate one player dropping and rejoining mid-game
const dropper = bots[1];

host.send(JSON.stringify({ t: "start" }));
for (let q = 0; q < quiz.questions.length; q++) {
  if (q === 2) { // reconnect test
    dropper.ws.close(); await sleep(300);
    const ws = await socket(`${WS}/ws/${pin}?role=player`);
    dropper.ws = ws;
    ws.onmessage = (e) => { const m = JSON.parse(e.data); dropper.msgs.push(m); if (m.t === "question" && !m.alreadyAnswered) ws.send(JSON.stringify({ t: "answer", q: m.index, choice: quiz.questions[m.index].correct })); };
    ws.send(JSON.stringify({ t: "join", pid: dropper.pid }));
  }
  // wait for reveal (all answered -> early reveal)
  const start = Date.now();
  while (!hostMsgs.find((m) => m.t === "reveal" && m.index === q)) { if (Date.now() - start > 12000) fail(`no reveal for question ${q + 1}`); await sleep(50); }
  const rev = hostMsgs.find((m) => m.t === "reveal" && m.index === q);
  const answeredCount = rev.counts.reduce((a, b) => a + b, 0);
  console.log(`Q${q + 1}: revealed after ${Date.now() - start} ms, ${answeredCount}/${N} answered, counts ${rev.counts.join("/")}`);
  if (answeredCount > N) fail("more answers than players (duplicates counted)");
  host.send(JSON.stringify({ t: "next" })); await sleep(150);
  host.send(JSON.stringify({ t: "next" })); await sleep(150);
}
await sleep(500);
const pod = hostMsgs.find((m) => m.t === "podium");
if (!pod) fail("no podium");
if (pod.results.length !== N) fail(`podium has ${pod.results.length} players`);
const finals = bots.filter((b) => b.msgs.some((m) => m.t === "final")).length;
if (finals !== N) fail(`${finals}/${N} players got their final result`);
const rejoined = dropper.msgs.filter((m) => m.t === "joined").length;
if (rejoined < 2) fail("rejoin did not happen");
const dropperResult = pod.results.find((r) => r.name === dropper.name);
console.log(`Rejoined player kept their spot: ${dropper.name} finished ${dropperResult.rank} with ${dropperResult.score}`);
// scores sane: max possible = 5 * (1000 + 400)
for (const r of pod.results) if (r.score < 0 || r.score > 5 * 1500) fail("score out of range " + r.score);
console.log("Podium:", pod.top.map((p) => `${p.name} ${p.score}`).join(" | "));
console.log(`PASS: ${N} players, ${quiz.questions.length} questions, ${Date.now() - t0} ms total`);
process.exit(0);
