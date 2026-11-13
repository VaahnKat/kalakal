// Question features test: several right answers, double points, no-points warm-up,
// plus the quick-type / spreadsheet parser.
// Usage: node test/editor-test.mjs [baseUrl]
const BASE = process.argv[2] || "http://localhost:8787";
const WS = BASE.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const ok = (m) => console.log("  ok -", m);
const socket = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(ws); ws.onerror = () => rej(new Error(url)); });

// ---- parser ----
const { parseQuick, parseSpreadsheetFile, toCSV, TEMPLATE_CSV, parseYouTube } = await import(new URL("../public/js/quicktype.js", import.meta.url));
const text = `1. Capital of Sweden?\n* Stockholm\n- Gothenburg\ntime: 30\npoints: double\n\nWhich are Tamil festivals?\na) Pongal *\nb) Midsummer\nc) Diwali *\n\nThe Thirukkural has 1330 couplets.\n* True\n- False\n\nBest snack?\n- Samosa\n- Kanelbulle`;
const p = parseQuick(text);
if (p.slides.length !== 4 || p.errors.length) fail("quick-type count " + JSON.stringify(p));
if (p.slides[0].points !== 2 || p.slides[0].time !== 30) fail("quick-type settings");
if (JSON.stringify(p.slides[1].correct) !== "[0,2]" || p.slides[1].answers[0] !== "Pongal") fail("quick-type several right / letters");
if (!p.slides[2].tf) fail("true/false not detected");
if (p.slides[3].type !== "poll") fail("poll not detected");
ok("quick-type: settings, several right answers, lettered answers, true/false, poll");
const tsv = parseQuick("Question\tAnswer 1\tAnswer 2\tCorrect\nCapital of Norway?\tOslo\tBergen\t1\n2+2?\t3\t4\tB");
if (tsv.slides.length !== 2 || JSON.stringify(tsv.slides[1].correct) !== "[1]") fail("tab-separated paste");
ok("rows pasted from a spreadsheet");
const tpl = parseSpreadsheetFile(TEMPLATE_CSV);
if (tpl.slides.length !== 4 || tpl.errors.length) fail("template import");
if (JSON.stringify(parseSpreadsheetFile(toCSV(tpl.slides)).slides) !== JSON.stringify(tpl.slides)) fail("CSV round trip");
ok("template imports, export → import round trip is identical");
if (parseYouTube("https://youtu.be/dQw4w9WgXcQ?t=1m5s").start !== 65) fail("youtube start");
ok("YouTube links with start time");
const bad = parseQuick("Only a question\n* one");
if (bad.slides.length || !bad.errors.length) fail("bad question not reported");
ok("helpful error for a question with one answer");

// ---- game rules ----
const quiz = { title: "Features", questions: [
  { type: "quiz", text: "Pick a festival", answers: ["Pongal", "Midsummer", "Diwali"], correct: [0, 2], time: 5, points: 1 },
  { type: "quiz", text: "Double", answers: ["A", "B"], correct: [1], time: 5, points: 2 },
  { type: "quiz", text: "Warm-up", answers: ["A", "B"], correct: 0, time: 5, points: 0 },
] };
const { pin, hostKey } = await fetch(`${BASE}/api/games`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quiz }) }).then((r) => r.json());
if (!pin) fail("game not created");
const host = await socket(`${WS}/ws/${pin}?role=host`); const H = [];
host.onmessage = (e) => H.push(JSON.parse(e.data)); host.send(JSON.stringify({ t: "host_hello", key: hostKey }));
const hs = (m) => host.send(JSON.stringify(m));
await sleep(200);
async function bot(name, plan) {
  const ws = await socket(`${WS}/ws/${pin}?role=player`); const b = { M: [] };
  ws.onmessage = (e) => { const m = JSON.parse(e.data); b.M.push(m); if (m.t === "question") setTimeout(() => ws.send(JSON.stringify({ t: "answer", q: m.index, choice: plan(m.index) })), 150); };
  ws.send(JSON.stringify({ t: "join", name, avatar: 1 })); return b;
}
const first = await bot("First", () => 0);      // Pongal (right), A (wrong), A (right, warm-up)
const third = await bot("Third", (i) => (i === 0 ? 2 : 1)); // Diwali (right), B (right, double), B (wrong, warm-up)
const wrong = await bot("Wrong", () => 1);      // Midsummer (wrong), B (right), B
await sleep(300);
hs({ t: "start" });
const waitFor = async (pred, ms = 9000) => { const t = Date.now(); while (Date.now() - t < ms) { if (pred()) return; await sleep(100); } fail("timeout"); };
const results = (b) => b.M.filter((m) => m.t === "result");
for (let q = 0; q < 3; q++) {
  await waitFor(() => H.some((m) => m.t === "question" && m.index === q));
  if (q === 1 && H.find((m) => m.t === "question" && m.index === 1).points !== 2) fail("question message missing points");
  await sleep(700); hs({ t: "skip" }); await sleep(900);
  await waitFor(() => results(first).length > q && results(third).length > q && results(wrong).length > q);
  hs({ t: "next" }); await sleep(300); hs({ t: "next" }); await sleep(300);
}
const r = (b) => results(b);
if (!r(first)[0].correct || !r(third)[0].correct || r(wrong)[0].correct) fail("several right answers " + JSON.stringify([r(first), r(third), r(wrong)].map((x) => x.map((y) => [y.correct, y.answered, y.points]))));
if (!r(first)[0].correctText.includes("Pongal / Diwali")) fail("correct text lists both answers");
const rev = H.find((m) => m.t === "reveal" && m.index === 0);
if (JSON.stringify(rev.correct) !== "[0,2]") fail("host reveal correct list");
ok("several right answers: either one scores, reveal highlights both");
const single = r(wrong)[1].points, dbl = r(third)[1].points;
if (!(single > 1000 && single <= 2100)) fail("double points " + single);
if (!(dbl > 1000)) fail("double with streak " + dbl);
ok(`double points: ${single} and ${dbl} (normal max is 1,000 + streak)`);
if (r(first)[2].points !== 0 || !r(first)[2].noPoints || !r(first)[2].correct) fail("warm-up scored");
if (r(third)[2].streak !== r(third)[1].streak) fail("warm-up changed the streak");
ok("no-points warm-up: right answer, 0 points, streak unchanged");
// ---- editing a game in the lobby ----
{
  const q1 = { title: "Before", questions: [{ type: "quiz", text: "Old?", answers: ["A", "B"], correct: 0, time: 5 }] };
  const g = await fetch(`${BASE}/api/games`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quiz: q1 }) }).then((r) => r.json());
  const hws = await socket(`${WS}/ws/${g.pin}?role=host`); const HM = [];
  hws.onmessage = (e) => HM.push(JSON.parse(e.data)); hws.send(JSON.stringify({ t: "host_hello", key: g.hostKey }));
  await sleep(300);
  const snap = HM.find((m) => m.t === "snapshot");
  if (!snap || !snap.quiz || snap.quiz.questions[0].text !== "Old?") fail("host snapshot missing the quiz");
  const pl = await socket(`${WS}/ws/${g.pin}?role=player`); const PM = [];
  pl.onmessage = (e) => PM.push(JSON.parse(e.data)); pl.send(JSON.stringify({ t: "join", name: "Waiting", avatar: 3 }));
  await sleep(300);
  hws.send(JSON.stringify({ t: "update_quiz", quiz: { title: "After", questions: [{ type: "quiz", text: "New?", answers: ["A", "B", "C"], correct: [2], time: 10 }, { type: "poll", text: "Snack?", answers: ["X", "Y"] }] } }));
  await sleep(300);
  const up = HM.find((m) => m.t === "quiz_updated");
  if (!up || up.quiz.title !== "After" || JSON.stringify(up.quiz.questions[0].correct) !== "[2]") fail("quiz not updated " + JSON.stringify(up));
  hws.send(JSON.stringify({ t: "update_quiz", quiz: { title: "Bad", questions: [{ type: "quiz", text: "x", answers: ["only"], correct: 0 }] } }));
  await sleep(200);
  if (!HM.some((m) => m.t === "update_error")) fail("invalid edit accepted");
  const st = await fetch(`${BASE}/api/games/${g.pin}`).then((r) => r.json());
  if (st.players !== 1 && !(Array.isArray(st.players) && st.players.length === 1)) fail("player lost after edit " + JSON.stringify(st));
  hws.send(JSON.stringify({ t: "start" })); await sleep(300);
  const q = PM.find((m) => m.t === "question");
  if (!q || q.text !== "New?" || q.answers.length !== 3) fail("game didn't use the edited quiz");
  const before = HM.filter((m) => m.t === "update_error").length;
  hws.send(JSON.stringify({ t: "update_quiz", quiz: { title: "Late", questions: [{ type: "quiz", text: "x?", answers: ["a", "b"], correct: 0 }] } }));
  await sleep(200);
  if (HM.filter((m) => m.t === "update_error").length !== before + 1) fail("edit allowed after start");
  ok("host can edit questions and right answers in the lobby; players stay; edits are refused once the game starts");
  hws.close(); pl.close();
}
console.log("PASS: question features");
process.exit(0);
