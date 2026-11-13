// Quiz validation shared by games, saved quizzes and the library.
import { clean } from "./text.js";

export const MAX_SLIDES = 50;
const TYPES = ["quiz", "poll", "wordcloud", "open", "scale", "qa"];

// Pictures stored by Kalakal (/media/...) or on the web (https), and YouTube clips.
// Pictures embedded in the browser (data: URLs) are never stored on the server.
export function validMedia(m) {
  if (!m || typeof m !== "object") return null;
  if (m.kind === "youtube" && /^[\w-]{11}$/.test(String(m.id))) {
    const t = (v) => Math.max(0, Math.min(36000, Math.floor(Number(v) || 0)));
    return { kind: "youtube", id: m.id, start: t(m.start), end: t(m.end) };
  }
  if (m.kind === "image") {
    const src = String(m.src || "");
    if (/^\/media\/u\/[\w-]{6,40}\/[\w-]{6,40}\.(webp|jpg|png|gif)$/.test(src)) return { kind: "image", src };
    if (/^https:\/\/[^\s"'<>]{4,490}$/.test(src)) return { kind: "image", src };
  }
  return null;
}

export function validateSession(q, { keepMedia = true } = {}) {
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
        // correct: one index or a list of indexes (any of them counts as right)
        const correct = [...new Set((Array.isArray(item.correct) ? item.correct : [item.correct]).map(Number))]
          .filter((c) => Number.isInteger(c) && c >= 0 && c < answers.length).sort();
        if (!correct.length) return { error: `Slide ${n} has no correct answer` };
        const time = Math.min(120, Math.max(5, Number(item.time) || 20));
        const points = [0, 1, 2].includes(Number(item.points)) ? Number(item.points) : 1;   // 0 = no points, 2 = double
        const slide = { type, text, answers, correct, time, points };
        const media = keepMedia && validMedia(item.media);
        if (media) slide.media = media;
        slides.push(slide);
      } else slides.push({ type, text, answers });
    } else if (type === "scale") {
      const statements = (Array.isArray(item.statements) ? item.statements : []).map((s) => clean(s, 80)).filter(Boolean).slice(0, 4);
      if (!statements.length) return { error: `Slide ${n} needs at least one statement to rate` };
      slides.push({ type, text, statements, low: clean(item.low, 24) || "Disagree", high: clean(item.high, 24) || "Agree" });
    } else slides.push({ type, text });
  }
  return { value: { title, questions: slides } };
}

