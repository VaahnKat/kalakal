// Kalakal sounds. Everything is synthesised in the browser with the Web Audio API:
// no audio files to download or license, and it works offline.
//
//   sfx("tick")            play a named effect (see SFX below)
//   jingle(seed)           a short tune that is always the same for the same player
//   mountMute(parent)      adds the sound on/off button
//
// Browsers only allow sound after the first tap or click on the page; until then calls do nothing.

const KEY = "kalakal:muted";
let ctx = null, master = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === "1"; } catch { /* private mode */ }

function audio() {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx.state === "running" ? ctx : null;
  } catch { return null; }
}
// Wake the audio engine on the first interaction, so later sounds (from network events) can play
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => audio(), { once: true, capture: true });

// One note: frequency in Hz, start offset and length in seconds
function note(freq, at = 0, len = 0.15, { type = "triangle", vol = 0.5, slideTo = 0 } = {}) {
  const c = audio(); if (!c) return;
  const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(master); o.start(t); o.stop(t + len + 0.03);
}
const seq = (freqs, step, len, opt) => freqs.forEach((f, i) => f && note(f, i * step, len, opt));

// Notes used below (C major pentatonic over two octaves keeps every tune pleasant)
const N = { C4: 261.6, D4: 293.7, E4: 329.6, G4: 392, A4: 440, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };
const SCALE = [N.C4, N.D4, N.E4, N.G4, N.A4, N.C5, N.D5, N.E5, N.G5, N.A5, N.C6];

const SFX = {
  join: () => seq([N.G5, N.C6], 0.07, 0.12, { type: "sine", vol: 0.35 }),
  tap: () => note(N.A5, 0, 0.06, { type: "sine", vol: 0.3 }),
  start: () => seq([N.C5, N.E5, N.G5, N.C6], 0.09, 0.16),
  question: () => note(300, 0, 0.28, { type: "sine", vol: 0.3, slideTo: 900 }),
  tick: () => note(N.E5, 0, 0.07, { type: "square", vol: 0.14 }),
  // last five seconds: n counts 5, 4, 3, 2, 1 and the pitch climbs
  countdown: (n = 1) => note(N.A4 * Math.pow(1.122, 5 - n), 0, 0.13, { type: "square", vol: 0.2 }),
  timeup: () => seq([N.G4, N.E4, N.C4], 0.11, 0.2, { type: "sawtooth", vol: 0.22 }),
  reveal: () => { seq([N.C5, N.E5, N.G5], 0.001, 0.5, { vol: 0.28 }); note(N.C6, 0.12, 0.5, { type: "sine", vol: 0.3 }); },
  correct: () => seq([N.E5, N.G5, N.C6, N.E6], 0.08, 0.18, { vol: 0.4 }),
  wrong: () => { note(220, 0, 0.22, { type: "sawtooth", vol: 0.2, slideTo: 160 }); note(160, 0.2, 0.3, { type: "sawtooth", vol: 0.2, slideTo: 110 }); },
  milestone: () => seq([N.C5, N.E5, N.G5, N.C6, N.E6, N.G6], 0.06, 0.16, { vol: 0.38 }),
  board: () => seq([N.G4, N.C5, N.E5], 0.1, 0.2, { type: "sine", vol: 0.35 }),
  fanfare: () => { seq([N.C5, N.C5, N.C5, N.E5, N.G5, N.E5, N.G5], 0.14, 0.2, { type: "square", vol: 0.2 }); seq([N.C6, N.E6, N.G6], 0.001, 1.2, { vol: 0.25 }) ; },
};

export function sfx(name, arg) { try { SFX[name] && SFX[name](arg); } catch { /* sound is never essential */ } }

// A player's own little tune: four notes and a tone picked from their name and character,
// so the room learns to recognise who just answered.
function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function jingle(seed, { vol = 0.3 } = {}) {
  try {
    let h = hash(seed);
    const take = (n) => { const v = h % n; h = Math.floor(h / n) ^ Math.imul(h, 2654435761) >>> 3; h >>>= 0; return v; };
    const type = ["triangle", "sine", "square", "sawtooth"][take(4)];
    const step = [0.07, 0.085, 0.1][take(3)];
    let at = 3 + take(5);
    const tune = [SCALE[at]];
    for (let i = 0; i < 3; i++) { at = Math.max(0, Math.min(SCALE.length - 1, at + [-2, -1, 1, 2, 3][take(5)])); tune.push(SCALE[at]); }
    seq(tune, step, 0.14, { type, vol: type === "square" || type === "sawtooth" ? vol * 0.55 : vol });
  } catch { /* ignore */ }
}

export const isMuted = () => muted;
export function setMuted(v) { muted = !!v; try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch { /* ignore */ } if (!muted) { audio(); sfx("tap"); } }

const ICON_ON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>';
export function mountMute(parent = document.body) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "mute-btn";
  const paint = () => { b.innerHTML = muted ? ICON_OFF : ICON_ON; b.setAttribute("aria-label", muted ? "Turn sound on" : "Turn sound off"); b.setAttribute("aria-pressed", String(!muted)); b.title = muted ? "Sound is off" : "Sound is on"; };
  b.addEventListener("click", () => { setMuted(!muted); paint(); });
  paint(); parent.appendChild(b);
  return b;
}
