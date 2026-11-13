// Kalakal avatars: every player gets their own Minni-style character.
// An avatar is one integer seed (0..AVATAR_COUNT-1) that decodes into
// body shape x body colour x ray colour x outfit x eyewear.
// Shared by the browser and the Worker (pure functions, no DOM).

const INK = "#160B2A", CREAM = "#FFF8EC";
const BODY_COLORS = ["#FFB627", "#19D3C5", "#FF5D73", "#A78BFA"];
const RAY_COLORS = ["#FF5D73", "#19D3C5", "#A78BFA", "#FFB627", "#FFF8EC"];
const BODIES = ["spark", "bubble"];
export const OUTFITS = ["none", "crown", "party", "hero", "wizard", "dj", "cricket", "viking", "chef", "grad", "jasmine", "ninja", "beanie", "astro"];
export const OUTFIT_NAMES = {
  none: "Classic", crown: "Royal", party: "Party", hero: "Superhero", wizard: "Wizard", dj: "DJ", cricket: "Cricketer",
  viking: "Viking", chef: "Chef", grad: "Graduate", jasmine: "Malli poo", ninja: "Ninja", beanie: "Winter", astro: "Astronaut",
};
const EYEWEAR = ["none", "none", "round", "shades", "stars"];
export const AVATAR_COUNT = BODIES.length * BODY_COLORS.length * RAY_COLORS.length * OUTFITS.length * EYEWEAR.length;

const STAR = "M0,-92 C12,-30 30,-12 92,0 C30,12 12,30 0,92 C-12,30 -30,12 -92,0 C-30,-12 -12,-30 0,-92Z";
const MINI_STAR = "M0,-20 C3,-6 6,-3 20,0 C6,3 3,6 0,20 C-3,6 -6,3 -20,0 C-6,-3 -3,-6 0,-20Z";
const S = `stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;

export function decodeAvatar(seed) {
  let n = Math.abs(Math.floor(Number(seed) || 0)) % AVATAR_COUNT;
  const pick = (len) => { const v = n % len; n = Math.floor(n / len); return v; };
  const body = BODIES[pick(BODIES.length)];
  const color = BODY_COLORS[pick(BODY_COLORS.length)];
  let ray = RAY_COLORS[pick(RAY_COLORS.length)];
  if (ray === color) ray = CREAM;
  const outfit = OUTFITS[pick(OUTFITS.length)];
  const eyes = EYEWEAR[pick(EYEWEAR.length)];
  return { body, color, ray, outfit, eyes };
}

export function encodeAvatar({ body = "spark", color = BODY_COLORS[0], ray = RAY_COLORS[0], outfit = "none", eyes = "none" }) {
  const parts = [[BODIES, body], [BODY_COLORS, color], [RAY_COLORS, ray], [OUTFITS, outfit], [EYEWEAR, eyes]];
  let seed = 0, mul = 1;
  for (const [list, v] of parts) { seed += Math.max(0, list.indexOf(v)) * mul; mul *= list.length; }
  return seed;
}

export const randomAvatar = () => Math.floor(Math.random() * AVATAR_COUNT);

// ---------- drawing ----------
function face(mood) {
  // returns [eyes, mouth] so eyewear can replace the eyes
  const eye = (cx) => `<ellipse cx="${cx}" cy="-6" rx="7" ry="10" fill="${INK}"/><circle cx="${cx + 2}" cy="-10" r="3" fill="${CREAM}"/>`;
  const smile = `<path d="M-16 14 Q0 30 16 14" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  if (mood === "happy") return [`<path d="M-27 -4 Q-18 -16 -9 -4" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M9 -4 Q18 -16 27 -4" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/>`, `<path d="M-18 8 Q0 40 18 8 Z" fill="${INK}"/>`];
  if (mood === "sad") return [`<ellipse cx="-18" cy="-4" rx="7" ry="9" fill="${INK}"/><ellipse cx="18" cy="-4" rx="7" ry="9" fill="${INK}"/>`, `<path d="M-14 24 Q0 12 14 24" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/>`];
  if (mood === "hurry") return [`<ellipse cx="-14" cy="-12" rx="7" ry="10" fill="${INK}"/><ellipse cx="22" cy="-12" rx="7" ry="10" fill="${INK}"/>`, `<circle cx="6" cy="20" r="7" fill="${INK}"/>`];
  if (mood === "fire") return [`<path d="M-28 -12 L-10 -6" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M28 -12 L10 -6" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><ellipse cx="-18" cy="2" rx="6" ry="7" fill="${INK}"/><ellipse cx="18" cy="2" rx="6" ry="7" fill="${INK}"/>`, `<path d="M-16 16 Q0 34 16 16 Z" fill="${INK}"/>`];
  if (mood === "wink") return [`${eye(-18)}<path d="M10 -6 Q18 -12 26 -6" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/>`, smile];
  return [`${eye(-18)}${eye(18)}`, smile];
}

function behind(outfit) {
  if (outfit === "hero") return `<path d="M-38 6 Q-86 84 -64 104 L64 104 Q86 84 38 6 Z" fill="#FF5D73" ${S}/>`;
  if (outfit === "astro") return `<circle r="78" fill="rgba(255,248,236,.16)" stroke="${CREAM}" stroke-width="5"/>`;
  return "";
}

function outfitLayer(outfit) {
  switch (outfit) {
    case "crown": return `<path d="M-34 -46 L-38 -82 L-18 -64 L0 -92 L18 -64 L38 -82 L34 -46 Z" fill="#FFE08A" ${S}/><circle cx="0" cy="-66" r="6" fill="#FF5D73" ${S}/><circle cx="-24" cy="-58" r="4" fill="#19D3C5"/><circle cx="24" cy="-58" r="4" fill="#19D3C5"/>`;
    case "party": return `<g transform="rotate(-14)"><path d="M-26 -48 L0 -108 L26 -48 Z" fill="#19D3C5" ${S}/><path d="M-15 -73 L15 -73 M-8 -90 L8 -90" stroke="${CREAM}" stroke-width="6"/><circle cx="0" cy="-110" r="9" fill="#FF5D73" ${S}/></g>`;
    case "hero": return `<path d="M-46 -20 Q0 -36 46 -20 L44 4 Q0 -8 -44 4 Z" fill="${INK}"/>`;
    case "wizard": return `<path d="M-48 -42 L48 -42 Q50 -36 44 -34 L-44 -34 Q-50 -36 -48 -42 Z" fill="#7C5BE0" ${S}/><path d="M-36 -42 L10 -118 L36 -42 Z" fill="#A78BFA" ${S}/><path transform="translate(-4 -70) scale(.45)" d="${MINI_STAR}" fill="#FFE08A"/><path transform="translate(14 -92) scale(.3)" d="${MINI_STAR}" fill="${CREAM}"/>`;
    case "dj": return `<path d="M-52 -4 A52 52 0 0 1 52 -4" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/><rect x="-66" y="-20" width="22" height="38" rx="9" fill="#FF5D73" ${S}/><rect x="44" y="-20" width="22" height="38" rx="9" fill="#FF5D73" ${S}/>`;
    case "cricket": return `<path d="M-46 -34 A46 38 0 0 1 46 -34 Z" fill="#19D3C5" ${S}/><path d="M16 -36 L70 -30 Q76 -22 66 -20 L16 -26 Z" fill="#0FA89C" ${S}/><circle cx="-2" cy="-70" r="4" fill="${INK}"/>`;
    case "viking": return `<path d="M-46 -48 Q-82 -58 -76 -100 Q-62 -70 -36 -62 Z" fill="${CREAM}" ${S}/><path d="M46 -48 Q82 -58 76 -100 Q62 -70 36 -62 Z" fill="${CREAM}" ${S}/><path d="M-48 -32 A48 44 0 0 1 48 -32 Z" fill="#9AA3B5" ${S}/><path d="M-48 -36 L48 -36" stroke="#FFE08A" stroke-width="8"/>`;
    case "chef": return `<path d="M-30 -44 L30 -44 L30 -66 A18 18 0 0 0 28 -100 A22 22 0 0 0 -8 -108 A20 20 0 0 0 -40 -90 A16 16 0 0 0 -30 -66 Z" fill="${CREAM}" ${S}/><path d="M-30 -56 L30 -56" stroke="${INK}" stroke-width="3"/>`;
    case "grad": return `<path d="M-30 -66 L-30 -46 Q0 -36 30 -46 L30 -66 Z" fill="${INK}"/><path d="M0 -94 L62 -76 L0 -58 L-62 -76 Z" fill="#2B2340" ${S}/><path d="M0 -76 L40 -70 L40 -44" stroke="#FFB627" stroke-width="4" fill="none"/><circle cx="40" cy="-40" r="6" fill="#FFB627"/>`;
    case "jasmine": {
      let f = "";
      for (let a = 200; a <= 340; a += 20) {
        const r = (a * Math.PI) / 180, x = Math.cos(r) * 52, y = Math.sin(r) * 52;
        f += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${CREAM}" stroke="${INK}" stroke-width="2.5"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="#FFB627"/>`;
      }
      return f + `<path d="M50 -18 Q64 6 58 30" stroke="#2FA866" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="58" cy="34" r="7" fill="${CREAM}" stroke="${INK}" stroke-width="2.5"/>`;
    }
    case "ninja": return `<rect x="-54" y="-40" width="108" height="16" rx="8" fill="#FF5D73" ${S}/><path d="M50 -32 Q78 -44 90 -20 M50 -30 Q74 -16 80 6" stroke="#FF5D73" stroke-width="8" fill="none" stroke-linecap="round"/>`;
    case "beanie": return `<path d="M-46 -34 A46 50 0 0 1 46 -34 Z" fill="#19D3C5" ${S}/><rect x="-50" y="-44" width="100" height="16" rx="8" fill="#FF5D73" ${S}/><circle cx="0" cy="-90" r="13" fill="${CREAM}" ${S}/>`;
    case "astro": return `<path d="M-60 -50 A78 78 0 0 1 60 -50" stroke="#A78BFA" stroke-width="5" fill="none"/><circle cx="58" cy="-58" r="7" fill="#FF5D73" ${S}/>`;
    default: return "";
  }
}

function eyewearLayer(eyes) {
  if (eyes === "round") return `<g fill="rgba(255,248,236,.25)" stroke="${INK}" stroke-width="4"><circle cx="-18" cy="-6" r="13"/><circle cx="18" cy="-6" r="13"/></g><path d="M-5 -8 Q0 -12 5 -8" stroke="${INK}" stroke-width="4" fill="none"/>`;
  if (eyes === "shades") return `<path d="M-36 -16 L-4 -16 L-6 2 Q-18 8 -30 2 Z M4 -16 L36 -16 L30 2 Q18 8 6 2 Z" fill="${INK}"/><path d="M-4 -12 L4 -12" stroke="${INK}" stroke-width="4"/><path d="M-28 -12 L-20 -12" stroke="#FFF8EC" stroke-width="3" opacity=".6"/>`;
  if (eyes === "stars") return `<path transform="translate(-19 -6) scale(.8)" d="${MINI_STAR}" fill="#FF5D73" ${S}/><path transform="translate(19 -6) scale(.8)" d="${MINI_STAR}" fill="#FF5D73" ${S}/>`;
  return "";
}

// Render an avatar. mood: ready | happy | sad | hurry | fire | wink
export function avatarSvg(seed, { size = 96, mood = "ready", label = "" } = {}) {
  const a = decodeAvatar(seed);
  const [eyesSvg, mouthSvg] = face(mood);
  const covered = a.eyes === "shades" || a.eyes === "stars";
  let bodySvg;
  if (a.body === "bubble") {
    bodySvg = `<path d="M-50 -56 H50 A22 22 0 0 1 72 -34 V30 A22 22 0 0 1 50 52 H-8 L-40 80 V52 H-50 A22 22 0 0 1 -72 30 V-34 A22 22 0 0 1 -50 -56 Z" fill="${a.color}" ${S}/><path transform="translate(66 -58) scale(.9)" d="${MINI_STAR}" fill="${a.ray}" ${S}/>`;
  } else {
    bodySvg = `<path d="${STAR}" fill="${a.ray}"/><circle r="54" fill="${a.color}"/>`;
  }
  const aria = label ? `role="img" aria-label="${String(label).replace(/["<>&]/g, "")}"` : 'aria-hidden="true"';
  const heroMask = a.outfit === "hero" ? outfitLayer("hero") : "";
  return `<svg class="av" ${aria} viewBox="-115 -125 230 240" width="${size}" height="${size}">${behind(a.outfit)}<g class="av-body">${bodySvg}</g><g class="av-face">${heroMask}${covered ? "" : a.outfit === "hero" ? eyesSvg.split(INK).join(CREAM) : eyesSvg}${mouthSvg}${eyewearLayer(a.eyes)}</g>${a.outfit === "hero" ? "" : outfitLayer(a.outfit)}</svg>`;
}

export function describeAvatar(seed) {
  const a = decodeAvatar(seed);
  return `${OUTFIT_NAMES[a.outfit]} ${a.body === "bubble" ? "Bubbi" : "Minni"}`;
}
