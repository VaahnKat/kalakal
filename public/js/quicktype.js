// Quick-type and spreadsheet import/export for quizzes.
//
// Quick-type (paste from anywhere, one blank line between questions):
//
//   What is the capital of Sweden?
//   * Stockholm          <- * marks a right answer (mark several if several are right)
//   - Gothenburg         <- - (or •) marks a wrong answer
//   - Malmö
//   time: 30             <- optional: seconds (10-60)
//   points: double       <- optional: double | none
//   image: https://...   <- optional: picture link
//   video: https://youtu.be/...   <- optional: YouTube link (add ?t=30 to start at 0:30)
//
// A question with no * becomes a poll (no right answer).
// Rows copied from Excel / Google Sheets (tab-separated) and CSV files use the
// spreadsheet columns in COLUMNS below.

export const COLUMNS = ["Type", "Question", "Answer 1", "Answer 2", "Answer 3", "Answer 4", "Correct", "Time", "Points", "Image link", "YouTube link"];
const TIMES = [10, 15, 20, 30, 45, 60];

// ---------- YouTube ----------
export function parseYouTube(url) {
  const s = String(url || "").trim();
  const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  if (!m) return null;
  const t = s.match(/[?&](?:t|start)=(\d+h)?(\d+m)?(\d+)s?/);
  const start = t ? (parseInt(t[1] || 0) * 3600 + parseInt(t[2] || 0) * 60 + parseInt(t[3] || 0)) : 0;
  return { kind: "youtube", id: m[1], start, end: 0 };
}

export function mediaFromLink(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  const yt = parseYouTube(s);
  if (yt) return yt;
  if (/^https?:\/\/\S+$/i.test(s)) return { kind: "image", src: s };
  return null;
}

// ---------- helpers ----------
const nearestTime = (n) => TIMES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), 20);
const pointsFrom = (v) => {
  const s = String(v || "").trim().toLowerCase();
  if (/^(double|2|x2|2x)$/.test(s)) return 2;
  if (/^(none|no|0|off|zero)$/.test(s)) return 0;
  return 1;
};
const isTF = (answers) => answers.length === 2 && /^true$/i.test(answers[0]) && /^false$/i.test(answers[1]);

function finish(slide, errors, label) {
  if (!slide.text) { errors.push(`${label}: no question text`); return null; }
  if (slide.answers.length < 2) { errors.push(`${label}: needs at least 2 answers`); return null; }
  if (slide.answers.length > 4) { errors.push(`${label}: has ${slide.answers.length} answers, the maximum is 4`); return null; }
  if (slide.correct.length) {
    const out = { type: "quiz", text: slide.text, answers: [...slide.answers, "", "", ""].slice(0, 4), correct: slide.correct, time: slide.time || 20, points: slide.points ?? 1 };
    if (isTF(slide.answers)) { out.tf = true; out.answers = slide.answers.slice(); }
    if (slide.media) out.media = slide.media;
    return out;
  }
  return { type: "poll", text: slide.text, answers: [...slide.answers, "", "", ""].slice(0, 4) };
}

// ---------- quick-type text ----------
function parseText(text) {
  const slides = [], errors = [];
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  blocks.forEach((lines, bi) => {
    const label = `Question ${bi + 1}`;
    const s = { text: "", answers: [], correct: [], time: 20, points: 1, media: null };
    for (let line of lines) {
      const setting = line.match(/^(time|points|image|picture|video|youtube)\s*:\s*(.+)$/i);
      if (setting) {
        const [, k, v] = setting, key = k.toLowerCase();
        if (key === "time") s.time = nearestTime(parseInt(v) || 20);
        else if (key === "points") s.points = pointsFrom(v);
        else s.media = mediaFromLink(v) || s.media;
        continue;
      }
      const right = line.match(/^(?:\*|✓|✔|\+|\[x\]|\(x\))\s*(.+)$/i) || line.match(/^(?:[-•–]\s*|[a-dA-D][).:]\s+)?(.+?)\s*(?:\*|✓|✔)$/);
      const wrong = line.match(/^(?:[-•–]|\[ \]|\( \))\s*(.+)$/);
      const letter = line.match(/^[a-dA-D][).:]\s+(.+)$/);
      if (right && (s.text || lines.indexOf(line) > 0)) { s.correct.push(s.answers.length); s.answers.push(right[1].trim()); }
      else if (wrong) s.answers.push(wrong[1].trim());
      else if (letter && s.text) s.answers.push(letter[1].replace(/\s*\*$/, "").trim());
      else if (!s.text) s.text = line.replace(/^(?:q\s*\d+\s*[:.)]|\d+\s*[.)]|question\s*\d*\s*:)\s*/i, "").trim();
      else s.answers.push(line);   // plain line after the question: treat as a wrong answer
    }
    const slide = finish(s, errors, label);
    if (slide) slides.push(slide);
  });
  return { slides, errors };
}

// ---------- spreadsheet rows (CSV / tab-separated) ----------
export function parseCSV(text, sep = ",") {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function parseRows(rows) {
  const slides = [], errors = [];
  if (!rows.length) return { slides, errors: ["The file is empty"] };
  let start = 0, idx = Object.fromEntries(COLUMNS.map((c, i) => [c.toLowerCase(), i]));
  const head = rows[0].map((c) => c.trim().toLowerCase());
  if (head.some((c) => c === "question" || c === "type")) {
    start = 1;
    const find = (...names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
    idx = {
      type: find("type"), question: find("question"),
      "answer 1": find("answer 1", "answer1", "option 1", "a"), "answer 2": find("answer 2", "answer2", "option 2", "b"),
      "answer 3": find("answer 3", "answer3", "option 3", "c"), "answer 4": find("answer 4", "answer4", "option 4", "d"),
      correct: find("correct", "right"), time: find("time"), points: find("points"),
      "image link": find("image", "picture"), "youtube link": find("youtube", "video"),
    };
  }
  const get = (r, k) => (idx[k] >= 0 && r[idx[k]] !== undefined ? String(r[idx[k]]).trim() : "");
  rows.slice(start).forEach((r, ri) => {
    const label = `Row ${ri + start + 1}`;
    const type = get(r, "type").toLowerCase();
    const text = get(r, "question");
    const raw = [get(r, "answer 1"), get(r, "answer 2"), get(r, "answer 3"), get(r, "answer 4")];
    let answers = raw.filter(Boolean);
    if (/true|false/.test(type) && !answers.length) answers = ["True", "False"];
    // Correct: "1", "1,3", "1;3", "A", "B, D" or the answer text itself
    const correct = [];
    get(r, "correct").split(/[,;/ ]+/).filter(Boolean).forEach((c) => {
      let n = /^\d+$/.test(c) ? Number(c) - 1 : /^[a-d]$/i.test(c) ? c.toUpperCase().charCodeAt(0) - 65 : -1;
      if (n >= 0 && n < raw.length && raw[n]) n = answers.indexOf(raw[n]);
      else n = answers.findIndex((a) => a.toLowerCase() === c.toLowerCase());
      if (n >= 0 && !correct.includes(n)) correct.push(n);
    });
    if (!text && !answers.length) return;
    if (/poll/.test(type)) correct.length = 0;
    else if (!correct.length && (type.includes("quiz") || /true|false/.test(type) || !type)) {
      if (!type || type.includes("quiz") || /true|false/.test(type)) { errors.push(`${label}: say which answer is right in the Correct column (1-4)`); return; }
    }
    const media = mediaFromLink(get(r, "youtube link")) || mediaFromLink(get(r, "image link"));
    const s = { text, answers, correct, time: nearestTime(parseInt(get(r, "time")) || 20), points: pointsFrom(get(r, "points")), media };
    const slide = finish(s, errors, label);
    if (slide) slides.push(slide);
  });
  return { slides, errors };
}

// ---------- entry points ----------
// Paste box: works out whether it's quick-type text or rows copied from a spreadsheet
export function parseQuick(text) {
  const t = String(text || "").trim();
  if (!t) return { slides: [], errors: [] };
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  const tabbed = lines.filter((l) => l.includes("\t")).length;
  if (tabbed >= Math.max(1, lines.length * 0.6)) return parseRows(parseCSV(t, "\t"));
  return parseText(t);
}

export function parseSpreadsheetFile(text) {
  const first = text.split(/\r?\n/)[0] || "";
  const sep = first.split("\t").length > first.split(",").length ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
  return parseRows(parseCSV(text.replace(/^﻿/, ""), sep));
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function toCSV(slides) {
  const rows = [COLUMNS];
  for (const q of slides) {
    if (q.type !== "quiz" && q.type !== "poll") continue;
    const correct = q.type === "quiz" ? (Array.isArray(q.correct) ? q.correct : [q.correct]).map((c) => c + 1).join(",") : "";
    const media = q.media || {};
    rows.push([
      q.type === "poll" ? "Poll" : q.tf ? "True or false" : "Quiz", q.text, ...[0, 1, 2, 3].map((i) => q.answers[i] || ""),
      correct, q.type === "quiz" ? q.time : "", q.type === "quiz" ? ({ 0: "none", 2: "double" }[q.points] || "normal") : "",
      media.kind === "image" && !String(media.src).startsWith("data:") ? media.src : "",
      media.kind === "youtube" ? `https://youtu.be/${media.id}${media.start ? `?t=${media.start}` : ""}` : "",
    ]);
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export const TEMPLATE_CSV = "﻿" + [
  COLUMNS,
  ["Quiz", "What is the capital of Sweden?", "Stockholm", "Gothenburg", "Malmö", "Uppsala", "1", "20", "normal", "", ""],
  ["Quiz", "Which of these are Tamil festivals? (any right answer counts)", "Pongal", "Midsummer", "Diwali", "Lucia", "1,3", "30", "double", "", ""],
  ["True or false", "The Thirukkural has 1330 couplets.", "True", "False", "", "", "1", "15", "normal", "", ""],
  ["Poll", "Which snack should we order?", "Samosa", "Kanelbulle", "Pizza", "", "", "", "", "", ""],
].map((r) => r.map(csvCell).join(",")).join("\r\n");

// Prompt people can paste into ChatGPT, Claude or Gemini; the reply pastes straight back in
export function aiPrompt(topic = "[your topic]", count = 10) {
  return `Write ${count} multiple-choice quiz questions about ${topic}.
Audience: [who is playing, e.g. families, age 10+]. Difficulty: [easy / medium / hard]. Language: [English].

Use exactly this format, with one blank line between questions and nothing else:

What is the capital of Sweden?
* Stockholm
- Gothenburg
- Malmö
- Uppsala

Rules: question under 120 characters; 2 to 4 answers, each under 60 characters;
put * before the right answer and - before wrong answers; make wrong answers believable;
check every fact.`;
}
