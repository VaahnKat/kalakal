// Kalakal Kural test: host + N bots go through every interaction slide type plus a quiz question.
// Usage: node test/engage-test.mjs [baseUrl] [players]
const BASE = process.argv[2] || "http://localhost:8787";
const N = Number(process.argv[3] || 30);
const WS = BASE.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error("FAIL:", msg); process.exit(1); };
const ok = (msg) => console.log("  ok -", msg);
const socket = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(ws); ws.onerror = () => rej(new Error("ws " + url)); });

const session = { title: "Engage test", questions: [
  { type: "wordcloud", text: "One word for your week" },
  { type: "poll", text: "Coffee or tea?", answers: ["Coffee", "Tea", "Both"] },
  { type: "scale", text: "Team health", statements: ["Clear communication", "Useful meetings"], low: "No", high: "Yes" },
  { type: "quiz", text: "2 + 2?", answers: ["3", "4"], correct: 1, time: 5 },
  { type: "open", text: "One idea?" },
  { type: "qa", text: "Ask anything" },
]};
const res = await fetch(`${BASE}/api/games`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quiz: session }) });
const { pin, hostKey, error } = await res.json(); if (!pin) fail(error);
console.log(`Session ${pin} with ${N} players`);
const bad = await fetch(`${BASE}/api/games`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quiz: { questions: [{ type: "scale", text: "x", statements: [] }] } }) });
if (bad.status !== 400) fail("scale without statements accepted"); ok("invalid scale slide rejected");

const host = await socket(`${WS}/ws/${pin}?role=host`); const H = [];
host.onmessage = (e) => H.push(JSON.parse(e.data));
host.send(JSON.stringify({ t: "host_hello", key: hostKey }));
const hsend = (m) => host.send(JSON.stringify(m));
const lastResults = (i) => [...H].reverse().find((m) => (m.t === "results" || m.t === "engage") && m.index === i)?.results;

const bots = [];
await Promise.all(Array.from({ length: N }, async (_, i) => {
  const ws = await socket(`${WS}/ws/${pin}?role=player`);
  const b = { i, ws, msgs: [], send: (m) => ws.send(JSON.stringify(m)) };
  ws.onmessage = (e) => b.msgs.push(JSON.parse(e.data));
  b.send({ t: "join", name: `Bot ${i}` }); bots.push(b);
}));
bots.sort((a, b) => a.i - b.i);
await sleep(600);
hsend({ t: "start" }); await sleep(400);

// 0: word cloud — each bot sends 2 words, bot0 tries 4 (limit 3), bot1 sends rude word
bots.forEach((b) => { b.send({ t: "respond", s: 0, text: b.i % 3 === 0 ? "Busy" : "Fun" }); b.send({ t: "respond", s: 0, text: b.i % 2 ? "busy" : "Calm" }); });
bots[0].send({ t: "respond", s: 0, text: "extra" }); bots[0].send({ t: "respond", s: 0, text: "too many" });
bots[1].send({ t: "respond", s: 0, text: "shit" });
await sleep(800);
let r = lastResults(0);
const busy = r.words.find((w) => w.text.toLowerCase() === "busy");
const expBusy = bots.filter((b) => b.i % 3 === 0).length + bots.filter((b) => b.i % 2).length;
if (!busy || busy.count !== expBusy) fail(`word cloud merge: busy=${busy && busy.count} expected ${expBusy}`); ok(`word cloud merges case: "busy" × ${busy.count}`);
if (r.words.some((w) => w.text === "too many")) fail("word limit not enforced"); ok("3-word limit enforced");
if (!bots[1].msgs.some((m) => m.t === "respond_error")) fail("rude word accepted"); ok("rude word blocked");
if (r.responses !== N) fail(`responses ${r.responses}`); ok(`${r.responses}/${N} responded`);

// 1: poll — everyone votes, then 5 change their vote
hsend({ t: "next" }); await sleep(300);
bots.forEach((b) => b.send({ t: "respond", s: 1, choice: b.i % 3 }));
await sleep(200);
bots.slice(0, 5).forEach((b) => b.send({ t: "respond", s: 1, choice: 2 }));
await sleep(700);
r = lastResults(1);
const total = r.counts.reduce((a, c) => a + c, 0);
if (total !== N) fail(`poll counts ${r.counts} total ${total}`); ok(`poll counts ${r.counts.join("/")} (vote changes counted once)`);

// 2: scale
hsend({ t: "next" }); await sleep(300);
bots.forEach((b) => b.send({ t: "respond", s: 2, values: [b.i % 2 ? 5 : 3, 4] }));
bots[2].send({ t: "respond", s: 2, values: [9, 1] }); // invalid
await sleep(700);
r = lastResults(2);
if (r.responses !== N || r.averages[1] !== 4) fail(`scale ${JSON.stringify(r)}`); ok(`scale averages ${r.averages.join(", ")}`);

// 3: quiz in the middle
hsend({ t: "next" }); await sleep(300);
bots.forEach((b) => b.send({ t: "answer", q: 3, choice: b.i % 4 ? 1 : 0 }));
await sleep(1200);
if (!H.find((m) => m.t === "reveal" && m.index === 3)) fail("quiz reveal missing in mixed session"); ok("quiz question works inside a mixed session");
hsend({ t: "next" }); await sleep(200); hsend({ t: "next" }); await sleep(300);

// 4: open text + hide
bots.forEach((b) => b.send({ t: "respond", s: 4, text: `Idea number ${b.i}` }));
await sleep(700);
r = lastResults(4);
if (r.items.length !== N) fail(`open items ${r.items.length}`);
hsend({ t: "hide", id: r.items[0].id }); await sleep(300);
if (!lastResults(4).items.find((x) => x.id === r.items[0].id).hidden) fail("hide failed"); ok(`${N} open answers, host can hide one`);

// 5: Q&A — 3 questions, votes, toggle, own-vote blocked, answered
hsend({ t: "next" }); await sleep(300);
bots[0].send({ t: "respond", s: 5, ask: "When is the next release?" });
bots[1].send({ t: "respond", s: 5, ask: "Can we get more fika?" });
bots[2].send({ t: "respond", s: 5, ask: "Who owns the roadmap?" });
await sleep(500);
const items = lastResults(5).items;
const fika = items.find((x) => x.text.includes("fika"));
bots.slice(3).forEach((b) => b.send({ t: "respond", s: 5, vote: fika.id }));
bots[1].send({ t: "respond", s: 5, vote: fika.id }); // own question: ignored
bots[3].send({ t: "respond", s: 5, vote: fika.id }); // toggle off
await sleep(700);
r = lastResults(5);
if (r.items[0].id !== fika.id || r.items[0].votes !== N - 4) fail(`qa votes ${JSON.stringify(r.items)}`); ok(`Q&A sorted by votes, top has ${r.items[0].votes} (toggle + own-vote rules hold)`);
const playerList = [...bots[10].msgs].reverse().find((m) => m.t === "qa_list");
if (!playerList || playerList.items.length !== 3) fail("players did not get live Q&A list"); ok("players receive the live Q&A list");
hsend({ t: "answered", id: fika.id }); await sleep(300);
if (!lastResults(5).items.find((x) => x.id === fika.id).answered) fail("answered failed"); ok("host can mark a question answered");

// Reconnect mid-slide keeps state
bots[4].ws.close(); await sleep(200);
const pid = bots[4].msgs.find((m) => m.t === "joined").pid;
const re = await socket(`${WS}/ws/${pin}?role=player`); const R = [];
re.onmessage = (e) => R.push(JSON.parse(e.data)); re.send(JSON.stringify({ t: "join", pid }));
await sleep(400);
const snap = R.find((m) => m.t === "engage");
if (!snap || snap.index !== 5 || !snap.myVotes.includes(fika.id)) fail("rejoin snapshot missing votes"); ok("rejoining player gets the current slide and their votes back");

// Finish: session has a quiz slide, so a podium with summary
hsend({ t: "next" }); await sleep(600);
const pod = H.find((m) => m.t === "podium");
if (!pod || pod.summary.length !== 6) fail("podium/summary missing"); ok("session ends with podium and full results summary");
console.log("PASS: all interaction types work");
process.exit(0);
