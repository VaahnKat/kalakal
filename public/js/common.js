// One address for everyone: send visitors from the old workers.dev address (and www.) to kalakal.se.
// A host page with a running game (host.html?pin=…) stays put, because its host key lives in this browser.
// Switch on (FORWARD = true) only after kalakal.se shows Kalakal (Cloudflare → Worker → Domains).
const MAIN_HOST = "kalakal.se";
const FORWARD = false;
(() => {
  if (!FORWARD) return;
  const h = location.hostname;
  if (h === MAIN_HOST || h === "localhost" || h === "127.0.0.1") return;
  if (!(h.endsWith(".workers.dev") || h === "www." + MAIN_HOST)) return;
  if (location.pathname === "/host.html" && new URLSearchParams(location.search).get("pin")) return;
  location.replace(`https://${MAIN_HOST}${location.pathname}${location.search}${location.hash}`);
})();

// Shared helpers for Kalakal pages.

export const SHAPES = [
  '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#160B2A"/></svg>',
  '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="#160B2A"/></svg>',
  '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2 L22 21 H2 Z" fill="#160B2A"/></svg>',
  '<svg aria-hidden="true" viewBox="-12 -12 24 24"><path d="M0,-11 C1.6,-3.3 3.3,-1.6 11,0 C3.3,1.6 1.6,3.3 0,11 C-1.6,3.3 -3.3,1.6 -11,0 C-3.3,-1.6 -1.6,-3.3 0,-11Z" fill="#160B2A"/></svg>',
];
export const SHAPE_NAMES = ["circle", "square", "triangle", "spark"];

const STAR = "M0,-92 C12,-30 30,-12 92,0 C30,12 12,30 0,92 C-12,30 -30,12 -92,0 C-30,-12 -12,-30 0,-92Z";
export function minni(mood = "ready", size = 120) {
  const ray = { ready: ["#FF5D73", 0], happy: ["#FFF8EC", 22], hurry: ["#A78BFA", -12], sad: ["#3A2660", 0] }[mood] || ["#FF5D73", 0];
  let face;
  if (mood === "happy") face = '<path d="M-27 -4 Q-18 -16 -9 -4" stroke="#160B2A" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M9 -4 Q18 -16 27 -4" stroke="#160B2A" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M-18 8 Q0 40 18 8 Z" fill="#160B2A"/>';
  else if (mood === "hurry") face = '<ellipse cx="-14" cy="-12" rx="7" ry="10" fill="#160B2A"/><ellipse cx="22" cy="-12" rx="7" ry="10" fill="#160B2A"/><circle cx="6" cy="20" r="7" fill="#160B2A"/>';
  else if (mood === "sad") face = '<ellipse cx="-18" cy="-4" rx="7" ry="9" fill="#160B2A"/><ellipse cx="18" cy="-4" rx="7" ry="9" fill="#160B2A"/><path d="M-14 24 Q0 12 14 24" stroke="#160B2A" stroke-width="5" stroke-linecap="round" fill="none"/>';
  else face = '<ellipse cx="-18" cy="-6" rx="7" ry="10" fill="#160B2A"/><ellipse cx="18" cy="-6" rx="7" ry="10" fill="#160B2A"/><circle cx="-16" cy="-10" r="3" fill="#FFF8EC"/><circle cx="20" cy="-10" r="3" fill="#FFF8EC"/><path d="M-16 14 Q0 30 16 14" stroke="#160B2A" stroke-width="5" stroke-linecap="round" fill="none"/>';
  return `<svg role="img" aria-label="Minni" viewBox="-100 -100 200 200" width="${size}" height="${size}"><path transform="rotate(${ray[1]})" d="${STAR}" fill="${ray[0]}"/><circle r="54" fill="#FFB627"/>${face}</svg>`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function show(id) {
  document.querySelectorAll("[data-screen]").forEach((el) => { el.hidden = el.dataset.screen !== id; });
  window.scrollTo(0, 0);
}

// WebSocket that reconnects automatically and re-sends a hello message.
export function connect(pin, role, { onOpen, onMessage, onStatus }) {
  let ws, closedByUs = false, tries = 0;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const open = () => {
    ws = new WebSocket(`${proto}://${location.host}/ws/${pin}?role=${role}`);
    ws.onopen = () => { tries = 0; onStatus && onStatus("online"); onOpen && onOpen(); };
    ws.onmessage = (ev) => { try { onMessage(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
    ws.onclose = (ev) => {
      if (closedByUs || ev.code === 4001 || ev.code === 4002 || ev.code === 4000) return;
      onStatus && onStatus("offline");
      tries++;
      setTimeout(open, Math.min(5000, 400 * tries));
    };
  };
  open();
  return {
    send: (msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    close: () => { closedByUs = true; ws && ws.close(); },
  };
}

// Countdown ring: returns a stop() function.
export function startTimer(el, totalMs, remainingMs, onEnd) {
  const R = 42, C = 2 * Math.PI * R;
  el.innerHTML = `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="${R}" stroke="#3A2660" stroke-width="8" fill="none"/><circle class="arc" cx="48" cy="48" r="${R}" stroke="#FFB627" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${C}"/></svg><div class="num" aria-live="off"></div>`;
  const arc = el.querySelector(".arc"), num = el.querySelector(".num");
  const end = performance.now() + remainingMs;
  let raf;
  const tick = () => {
    const left = Math.max(0, end - performance.now());
    num.textContent = Math.ceil(left / 1000);
    arc.style.strokeDashoffset = String(C * (1 - left / totalMs));
    arc.style.stroke = left < 5000 ? "#FF5D73" : "#FFB627";
    if (left > 0) raf = requestAnimationFrame(tick); else onEnd && onEnd();
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

export function confetti(count = 120) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = document.createElement("div");
  box.className = "confetti";
  const colors = ["#FFB627", "#19D3C5", "#FF5D73", "#A78BFA", "#FFF8EC"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 2.5 + Math.random() * 2.5 + "s";
    p.style.animationDelay = Math.random() * 0.8 + "s";
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 6000);
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
