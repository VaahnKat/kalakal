// Text helpers shared by the game rooms and the AI generator.

// Short starter list; extend as needed. Matched as whole words (or inside squashed text for longer words).
const BLOCKED = ["fuck", "fucking", "shit", "bitch", "cunt", "dick", "pussy", "nigger", "nigga", "whore", "slut", "fag", "rape", "nazi", "hitler", "porn", "sex", "asshole", "bastard"];

export function clean(s, max) {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function isRude(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/);
  const squashed = lower.replace(/[^a-z]/g, "");
  return BLOCKED.some((w) => words.includes(w) || (w.length >= 5 && squashed.includes(w)));
}
