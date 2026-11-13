// AI generator test, using the fake AI (npm run dev sets AI_MOCK=1).
// Usage: node test/ai-test.mjs [baseUrl]
const BASE = process.argv[2] || "http://localhost:8787";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const ok = (m) => console.log("  ok -", m);
const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

const reset = await post("/api/ai/reset", {});
if (!reset.ok) fail("reset needs the fake AI: run `npm run dev` (AI_MOCK=1)");
const q0 = await fetch(BASE + "/api/ai/quota").then((r) => r.json());
if (q0.quizzes !== 5 || q0.tweaks !== 40) fail("starting allowance " + JSON.stringify(q0));
ok("allowance: 5 quizzes and 40 edits per person per day");

const empty = await post("/api/ai/quiz", { count: 10 });
if (empty.status !== 400) fail("empty topic accepted");
const rude = await post("/api/ai/quiz", { topic: "porn", count: 5 });
if (rude.status !== 400) fail("rude topic accepted");
ok("rejects an empty or rude topic");

const r = await post("/api/ai/quiz", { topic: "Pongal festival", count: 10, language: "Tamil", time: 30, level: "hard", audience: "kids" });
if (r.status !== 200 || r.slides.length !== 10) fail("quiz count " + r.status + " " + (r.slides || []).length);
if (r.quizzes !== 4) fail("allowance not counted");
const s = r.slides;
if (!s.every((x) => x.type === "quiz" && x.answers.length === 4 && x.correct.length === 1 && x.time === 30 && x.points === 1)) fail("slide shape");
if (!s.every((x) => !/\*\*|^\d+\./.test(x.text))) fail("markdown/numbering not cleaned");
if (!s[0].text.includes("[Tamil]")) fail("language not passed to the model");
if (new Set(s.map((x) => x.correct[0])).size < 2) fail("right answer always in the same place");
ok("10 clean questions in the chosen language, time applied, right answer shuffled into different places");

const src = await post("/api/ai/quiz", { source: "x".repeat(50000), count: 5 });
if (src.status !== 200 || src.slides.length !== 5) fail("notes-only quiz");
ok("works from notes alone (long text is trimmed)");

const base = { text: "Capital of Sweden?", answers: ["Oslo", "Stockholm", "Bergen", "Malmö"], correct: [1], time: 20, points: 2 };
const d = await post("/api/ai/tweak", { topic: "Sweden", action: "distractors", slide: base });
if (d.status !== 200 || d.slide.text !== base.text || d.slide.answers[d.slide.correct[0]] !== "Stockholm" || d.slide.answers.length < 2 || d.slide.points !== 2) fail("better wrong answers " + JSON.stringify(d));
ok("better wrong answers keeps the question, right answer and points");
const h = await post("/api/ai/tweak", { topic: "Sweden", action: "harder", slide: base, avoid: [base.text] });
if (h.status !== 200 || !/harder/.test(h.slide.text) || h.tweaks !== 38) fail("harder " + JSON.stringify(h));
ok("harder rewrites the question and counts an edit");
const bad = await post("/api/ai/tweak", { topic: "Sweden", action: "new", slide: { text: "x", answers: ["a"], correct: [0] } });
if (bad.status !== 400) fail("incomplete question accepted");
ok("rejects an incomplete question");

let last;
for (let i = 0; i < 5; i++) last = await post("/api/ai/quiz", { topic: "Space", count: 5 });
if (last.status !== 429 || !last.limit || last.quizzes !== 0) fail("daily limit " + JSON.stringify(last));
ok("6th quiz of the day is refused with a friendly message: " + last.error.slice(0, 60) + "…");
await post("/api/ai/reset", {});
console.log("PASS: AI generator");
