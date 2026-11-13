// Shared account helpers: the top-right sign-in / account menu, the site footer and API calls.
// Pages include <div data-nav></div> and <footer data-foot></footer> and import this module.
import { esc } from "/js/common.js";

let mePromise = null;
export function me(refresh = false) {
  if (!mePromise || refresh) mePromise = fetch("/api/me", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({ user: null, signIn: false, accounts: false }));
  return mePromise;
}

export async function api(path, { method = "GET", body, raw, type } = {}) {
  const res = await fetch(path, {
    method, credentials: "same-origin",
    headers: raw ? { "content-type": type } : body ? { "content-type": "application/json" } : {},
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  let data = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Please try again."), { status: res.status, data });
  return data;
}

export const signInUrl = (next = location.pathname + location.search) => `/auth/google?next=${encodeURIComponent(next)}`;

export async function signIn(next) {
  const m = await me();
  if (m.dev) { const email = prompt("Local test sign-in: email", "test@test.local"); if (email) location.href = `/auth/dev?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next || location.pathname + location.search)}`; return; }
  location.href = signInUrl(next);
}

export async function signOut() {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  location.href = "/";
}

const initial = (name) => esc((name || "?").trim().charAt(0).toUpperCase());

export async function mountNav(current = "") {
  const slot = document.querySelector("[data-nav]");
  if (!slot) return;
  const links = [["library", "/library.html", "Library"], ["create", "/create.html", "Create"], ["host", "/host.html", "Host a game"]];
  const linkHtml = links.map(([k, href, label]) => `<a class="nav-link" href="${href}"${current === k ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  slot.innerHTML = `<div class="site-nav"><a class="brand" href="/"><img src="/img/icon.svg" alt="">kalakal</a><div class="nav-links">${linkHtml}<span id="acctSlot"></span></div></div>`;
  const m = await me();
  const box = slot.querySelector("#acctSlot");
  if (!m.accounts) return;
  if (!m.user) {
    if (m.signIn) { box.innerHTML = `<button class="btn btn-primary btn-sm" type="button" id="navSignIn">Sign in</button>`; box.querySelector("button").onclick = () => signIn(); }
    return;
  }
  const u = m.user;
  box.innerHTML = `<div class="acct"><button class="acct-btn" type="button" aria-haspopup="true" aria-expanded="false">${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="acct-initial">${initial(u.name)}</span>`}<span>${esc(u.name)}</span></button>
    <div class="acct-menu" hidden><p class="who">${esc(u.email || "")}</p><a href="/me.html">My quizzes</a><a href="/me.html#account">Account</a>${u.admin ? '<a href="/admin.html">Admin</a>' : ""}<button type="button" data-out>Sign out</button></div></div>`;
  const btn = box.querySelector(".acct-btn"), menu = box.querySelector(".acct-menu");
  btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); };
  document.addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); });
  box.querySelector("[data-out]").onclick = signOut;
}

export function mountFooter() {
  const f = document.querySelector("[data-foot]");
  if (!f) return;
  f.className = "site-foot";
  f.innerHTML = `<span>© ${new Date().getFullYear()} Kalakal · Made in Stockholm</span><nav aria-label="Footer"><a href="/library.html">Library</a><a href="/create.html">Create a quiz</a><a href="/create.html#faq">Help &amp; FAQ</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="mailto:hello@kalakal.se">Contact</a></nav>`;
}

// Quiz cards for the library, the home page and creator pages
const GLYPHS = ["/img/mascots/host-happy.webp", "/img/mascots/explorer-happy.webp", "/img/mascots/champion-happy.webp"];
export const CAT_ORDER = ["general", "tamil", "sweden", "festivals", "entertainment", "sports", "science", "history", "kids", "languages", "work", "fun"];
const BG = ["#FFB627", "#19D3C5", "#FF5D73", "#A78BFA"];
export function cardHtml(q) {
  const ci = Math.max(0, CAT_ORDER.indexOf(q.category));
  const cover = q.cover
    ? `<img class="photo" src="${esc(q.cover)}" alt="" loading="lazy">`
    : `<img class="glyph" src="${GLYPHS[ci % 3]}" alt="" loading="lazy">`;
  return `<a class="q-cardx" href="/quiz.html?id=${esc(q.id)}">
    <div class="q-cover" style="background:${BG[ci % 4]}">${cover}<span class="count">${q.questions} Q</span></div>
    <div class="q-body"><span class="chip-cat cat-${ci % 4}">${esc(q.categoryName || "Quiz")}</span><h3>${esc(q.title)}</h3>
      ${q.creator ? `<p class="muted" style="font-size:14px">by ${esc(q.creator.name)}</p>` : ""}
      <div class="q-meta"><span>▶ ${q.plays} plays</span><span>♥ ${q.likes}</span><span>${esc(q.language || "")}</span></div></div></a>`;
}
