// My quizzes, first-time welcome (13+ and terms) and account settings.
import { $, esc } from "/js/common.js";
import { mountNav, mountFooter, api, me, signIn, signOut } from "/js/account.js";

mountNav(); mountFooter();
const params = new URLSearchParams(location.search);
const VIS = { private: "Private", unlisted: "Unlisted", public: "Public" };
const fmt = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

async function start() {
  const m = await me();
  if (!m.accounts) { $("#main").innerHTML = `<div class="empty"><h1 style="font-size: 30px">Accounts are coming soon</h1><p class="muted">You can still create and host quizzes without an account.</p><a class="btn btn-primary" href="/host.html?build=play">Create a quiz</a></div>`; return; }
  if (!m.user) {
    $("#main").innerHTML = `<div class="empty"><img class="mascot float" src="/img/mascots/host-happy.webp" alt="" width="120" height="170"><h1 style="font-size: 32px">Save your quizzes</h1>
      <p class="muted" style="max-width: 32rem">Sign in to keep your quizzes on any device, share them in the library and see how often they're played. Players never need an account.</p>
      ${m.signIn ? '<button class="btn btn-primary" type="button" id="si">Sign in with Google</button>' : '<p class="notice">Sign-in is being set up. Please try again soon.</p>'}</div>`;
    const b = $("#si"); if (b) b.onclick = () => signIn("/me.html");
    return;
  }
  if (!m.user.acceptedTerms || params.get("welcome")) return welcome(m.user);
  return dashboard(m.user);
}

function welcome(u) {
  $("#main").innerHTML = `<div class="panel welcome stack" style="gap: 18px">
    <img class="mascot" src="/img/mascots/champion-happy.webp" alt="" width="110" height="154" style="align-self: center">
    <h1 style="font-size: 30px; text-align: center">Welcome to Kalakal!</h1>
    <div class="field"><label for="dn">Your name on public quizzes</label><input id="dn" type="text" maxlength="40" value="${esc(u.name)}"></div>
    <label class="check"><input type="checkbox" id="age13"><span>I'm 13 years or older.</span></label>
    <label class="check"><input type="checkbox" id="terms"><span>I agree to the <a href="/terms.html" target="_blank">Terms of use</a> and have read the <a href="/privacy.html" target="_blank">Privacy policy</a>.</span></label>
    <p class="error" id="wErr" role="alert" hidden></p>
    <button class="btn btn-primary" type="button" id="go">Continue</button>
    <p class="muted" style="font-size: 15px; text-align: center">Changed your mind? <button class="link-like" type="button" id="no" style="background:none;border:0;color:var(--teal);text-decoration:underline;cursor:pointer;font:inherit">Sign out and delete this new account</button></p>
  </div>`;
  if (u.acceptedTerms) { $("#age13").checked = true; $("#terms").checked = true; }
  $("#go").onclick = async () => {
    const err = $("#wErr");
    if (!$("#age13").checked || !$("#terms").checked) { err.textContent = "Please tick both boxes to continue. Kalakal accounts are for people aged 13 and over."; err.hidden = false; return; }
    try {
      await api("/api/me", { method: "POST", body: { displayName: $("#dn").value, acceptTerms: true } });
      await me(true);
      const next = params.get("next");
      location.href = next && next.startsWith("/") && !next.startsWith("//") && next !== "/me.html" ? next : "/me.html";
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  };
  $("#no").onclick = async () => {
    if (!confirm("Delete this account? You can always sign in again later.")) return;
    await api("/api/me", { method: "DELETE", body: { confirm: "DELETE" } }).catch(() => {});
    location.href = "/";
  };
}

async function dashboard(u) {
  $("#main").innerHTML = `
    <div class="row" style="justify-content: space-between; padding: 8px 0 18px">
      <div><p class="eyebrow">My quizzes</p><h1 style="font-size: clamp(30px, 4vw, 44px)">Hi ${esc(u.name)}!</h1></div>
      <div class="row"><a class="btn btn-primary" href="/host.html?build=play">New quiz</a><a class="btn btn-ghost" href="/host.html?build=kural">New Pulse session</a></div>
    </div>
    <p class="notice" id="importBox" hidden></p>
    <div class="mq" id="list"><p class="muted">Loading your quizzes…</p></div>
    <section class="panel stack" id="account" style="gap: 16px; margin-top: 40px">
      <h2 style="font-size: 24px">Account</h2>
      <div class="field"><label for="dn">Your name on public quizzes</label><div class="row"><input id="dn" type="text" maxlength="40" value="${esc(u.name)}" style="flex: 1 1 240px"><button class="btn btn-ghost btn-sm" type="button" id="saveName">Save name</button></div></div>
      <p class="muted">Signed in with Google as ${esc(u.email || "")}.</p>
      <div class="row"><a class="btn btn-ghost btn-sm" href="/api/me/export" download>Download my data</a><button class="btn btn-ghost btn-sm" type="button" id="out">Sign out</button></div>
      <details class="panel danger"><summary style="cursor: pointer; font-weight: 800">Delete my account</summary>
        <div class="stack" style="gap: 12px; padding-top: 12px"><p class="muted">This permanently deletes your account, all your quizzes (also from the library), your pictures and likes. It can't be undone.</p>
        <div class="field"><label for="delC">Type DELETE to confirm</label><input id="delC" type="text" autocomplete="off"></div>
        <button class="btn btn-sm" style="background: var(--coral); color: var(--ink)" type="button" id="del">Delete everything</button></div></details>
      <p class="error" id="aErr" role="alert" hidden></p>
    </section>`;
  $("#saveName").onclick = async () => { try { await api("/api/me", { method: "POST", body: { displayName: $("#dn").value } }); $("#saveName").textContent = "Saved"; } catch (e) { $("#aErr").textContent = e.message; $("#aErr").hidden = false; } };
  $("#out").onclick = signOut;
  $("#del").onclick = async () => {
    try { await api("/api/me", { method: "DELETE", body: { confirm: $("#delC").value.trim() } }); location.href = "/"; }
    catch (e) { $("#aErr").textContent = e.message; $("#aErr").hidden = false; }
  };
  if (location.hash === "#account") $("#account").scrollIntoView();
  offerImport();
  loadList();
}

async function loadList() {
  const { quizzes } = await api("/api/quizzes");
  $("#list").innerHTML = quizzes.length ? quizzes.map((q) => {
    const state = q.visibility === "public" && q.status === "review" ? '<span class="badge review">Waiting for approval</span>'
      : q.status === "hidden" ? '<span class="badge hidden">Hidden after reports</span>' : `<span class="badge ${q.visibility}">${VIS[q.visibility]}</span>`;
    const build = q.mode === "pulse" ? "kural" : "play";
    return `<div class="mq-row" data-id="${q.id}">
      <div><h3>${esc(q.title)}</h3><div class="mq-meta">${state}<span>${q.questions} slide${q.questions === 1 ? "" : "s"}</span><span>${esc(q.categoryName)}</span><span>▶ ${q.plays}</span><span>♥ ${q.likes}</span><span>Edited ${fmt(q.updatedAt)}</span></div></div>
      <div class="mq-act"><button class="btn btn-primary btn-sm" type="button" data-act="host">Host</button><a class="btn btn-ghost btn-sm" href="/host.html?build=${build}&quiz=${q.id}">Edit</a>
        <a class="btn btn-ghost btn-sm" href="/quiz.html?id=${q.id}">Page</a><button class="btn btn-ghost btn-sm" type="button" data-act="dup">Duplicate</button><button class="btn btn-ghost btn-sm" type="button" data-act="del">Delete</button></div></div>`;
  }).join("") : `<div class="empty"><img class="mascot" src="/img/mascots/explorer-happy.webp" alt="" width="110" height="150"><h2 style="font-size: 24px">No saved quizzes yet</h2><p class="muted">Make one, or copy one from the library and make it yours.</p><div class="row" style="justify-content:center"><a class="btn btn-primary" href="/host.html?build=play">Create a quiz</a><a class="btn btn-ghost" href="/library.html">Browse the library</a></div></div>`;
}

$("#main").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.closest("[data-id]").dataset.id;
  try {
    if (b.dataset.act === "host") {
      const g = await api("/api/games", { method: "POST", body: { quizId: id } });
      localStorage.setItem("kalakal:host:" + g.pin, g.hostKey);
      location.href = `/host.html?pin=${g.pin}`;
    } else if (b.dataset.act === "dup") { await api(`/api/quizzes/${id}/copy`, { method: "POST" }); loadList(); }
    else if (b.dataset.act === "del") {
      if (!confirm("Delete this quiz? It will also disappear from the library.")) return;
      await api(`/api/quizzes/${id}`, { method: "DELETE" }); loadList();
    }
  } catch (ex) { alert(ex.message); }
});

// Quizzes made before signing in live in this browser: offer to save them to the account
function offerImport() {
  const drafts = [];
  for (const mode of ["play", "kural"]) {
    try {
      const d = JSON.parse(localStorage.getItem("kalakal:draft:" + mode) || "null");
      if (d && !d.id && d.questions && d.questions.some((q) => (q.text || "").trim())) drafts.push({ mode, d });
    } catch { /* ignore */ }
  }
  if (!drafts.length) return;
  const box = $("#importBox");
  box.hidden = false;
  box.innerHTML = `You have ${drafts.length === 1 ? "a quiz draft" : "quiz drafts"} in this browser: ${drafts.map(({ d }) => `<strong>${esc(d.title || "Untitled")}</strong>`).join(", ")}. Open ${drafts.length === 1 ? "it" : "each"} in the editor and press <strong>Save to My quizzes</strong>. ${drafts.map(({ mode, d }) => `<a href="/host.html?build=${mode}">Open ${esc(d.title || "draft")}</a>`).join(" · ")}`;
}

start();
