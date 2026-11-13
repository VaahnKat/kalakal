// Pictures and videos inside questions (host screen only for now).
// Uploaded pictures are shrunk in the browser and kept with the draft, so no server storage is needed.
import { esc } from "/js/common.js";

const MAX_SIDE = 1280;
const TARGET_BYTES = 350 * 1024;

const load = (file) => new Promise((ok, fail) => {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); ok(img); };
  img.onerror = () => { URL.revokeObjectURL(url); fail(new Error("That file isn't a picture we can read")); };
  img.src = url;
});

export async function compressImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Please choose a picture (JPG, PNG, WebP or GIF)");
  // Animated GIFs would lose their animation on a canvas: keep small ones as they are
  if (file.type === "image/gif" && file.size <= 1.5 * 1024 * 1024) {
    return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file); });
  }
  if (file.type === "image/gif") throw new Error("That GIF is over 1.5 MB. Use a smaller one or paste a GIF link instead");
  const img = await load(file);
  let side = MAX_SIDE, quality = 0.82, data = "";
  for (let i = 0; i < 4; i++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    data = c.toDataURL("image/webp", quality);
    if (!data.startsWith("data:image/webp")) data = c.toDataURL("image/jpeg", quality);
    if (data.length * 0.75 <= TARGET_BYTES) break;
    side = Math.round(side * 0.8); quality -= 0.1;
  }
  return data;
}

export const ytThumb = (m) => `https://i.ytimg.com/vi/${m.id}/hqdefault.jpg`;

export function ytEmbed(m, { autoplay = true } = {}) {
  const p = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
  if (autoplay) p.set("autoplay", "1");
  if (m.start) p.set("start", String(m.start));
  if (m.end) p.set("end", String(m.end));
  return `https://www.youtube-nocookie.com/embed/${m.id}?${p}`;
}

// Big-screen rendering
export function mediaHtml(m) {
  if (!m) return "";
  if (m.kind === "image") return `<img class="q-media" src="${esc(m.src)}" alt="">`;
  if (m.kind === "youtube") return `<iframe class="q-media q-video" src="${esc(ytEmbed(m))}" title="Question video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  return "";
}

const secs = (v) => { const s = String(v || "").trim(); if (!s) return 0; const p = s.split(":").map(Number); return p.some(isNaN) ? 0 : p.reduce((a, b) => a * 60 + b, 0); };
export const parseTime = secs;
export const fmtTime = (n) => (n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}` : "");
