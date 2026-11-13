// A quiz's public page: details (never the answers), Host, Copy and edit, Like, Share, Report.
import { $, esc } from "/js/common.js";
import { mountNav, mountFooter, api, me, signIn, CAT_ORDER } from "/js/account.js";

mountNav("library"); mountFooter();
const id = new URLSearchParams(location.search).get("id") || "";
const BG = ["#FFB627", "#19D3C5", "#FF5D73", "#A78BFA"];
const GLYPHS = ["/img/mascots/host-happy.webp", "/img/mascots/explorer-happy.webp", "/img/mascots/champion-happy.webp"];
const TYPE = { quiz: "Quiz questions", poll: "Polls", wordcloud: "Word clouds", open: "Open questions", scale: "Scales", qa: "Q&A" };

async function render() {
  let q;
  try { q = await api(`/api/library/${encodeURIComponent(id)}`); }
  catch (e) {
    $("#main").innerHTML = `<div class="empty"><img class="mascot" src="/img/mascots/explorer-thinking.webp" alt="" width="110" height="162"><h1 style="font-size: 30px">Quiz not found</h1><p class="muted">It may be private or removed.</p><a class="btn btn-primary" href="/library.html">Browse the library</a></div>`;
    return;
  }
  document.title = `${q.title} · Kalakal`;
  const ci = Math.max(0, CAT_ORDER.indexOf(q.category));
  const status = q.own && q.status === "review" ? `<p class="notice warn">Waiting for approval: new creators' first public quiz is checked before it appears in the library. You can already host it and share this link.</p>`
    : q.own && q.status === "hidden" ? `<p class="notice warn">Hidden from the library after reports. We'll review it soon.</p>`
    : q.own && q.visibility === "unlisted" ? `<p class="notice">Unlisted: only people with this link can see it.</p>`
    : q.own && q.visibility === "private" ? `<p class="notice">Private: only you can see this page.</p>` : "";
  $("#main").innerHTML = `
    <div class="qd">
      <div class="stack" style="gap: 16px">
        <a class="muted" href="/library.html?category=${esc(q.category)}" style="font-weight: 700">← ${esc(q.categoryName)}</a>
        <h1>${esc(q.title)}</h1>
        ${q.creator ? `<p class="muted">by <a href="/library.html?q=" data-creator="${esc(q.creator.id)}">${esc(q.creator.name)}</a></p>` : ""}
        ${q.description ? `<p style="font-size: 19px">${esc(q.description)}</p>` : ""}
        ${status}
        <div class="row">
          <button class="btn btn-primary" type="button" id="host">Host this quiz</button>
          <button class="btn btn-ghost" type="button" id="copy">${q.own ? "Duplicate" : "Copy and edit"}</button>
          ${q.own ? `<a class="btn btn-ghost" href="/host.html?build=${q.mode === "pulse" ? "kural" : "play"}&quiz=${esc(q.id)}">Edit</a>` : ""}
        </div>
        <div class="row">
          <button class="btn btn-ghost btn-sm like" type="button" id="like" aria-pressed="${q.liked}">♥ <span id="likes">${q.likes}</span></button>
          <button class="btn btn-ghost btn-sm" type="button" id="share">Share</button>
          ${q.own ? "" : '<button class="btn btn-ghost btn-sm" type="button" id="report">Report</button>'}
        </div>
        <p class="error" id="err" role="alert" hidden></p>
        <div class="facts">
          <div class="fact"><b>${q.questions}</b><span>slides</span></div>
          <div class="fact"><b>${q.plays}</b><span>times played</span></div>
          ${q.avgTime ? `<div class="fact"><b>${q.avgTime} s</b><span>per question</span></div>` : ""}
          <div class="fact"><b>${esc(q.language)}</b><span>language</span></div>
        </div>
      </div>
      <div class="stack" style="gap: 16px">
        <div class="q-cover" style="background:${BG[ci % 4]}">${q.cover ? `<img class="photo" src="${esc(q.cover)}" alt="">` : `<img class="glyph" src="${GLYPHS[ci % 3]}" alt="">`}</div>
        <div class="preview"><p class="eyebrow">First questions</p><ol>${q.preview.map((p, i) => `<li>${i + 1}. ${esc(p.text)}</li>`).join("")}</ol>
          <p class="muted" style="font-size: 15px">${q.types.map((t) => TYPE[t]).join(" · ")}${q.pictures ? " · with pictures" : ""}. Answers stay hidden until you play.</p></div>
      </div>
    </div>`;
  const err = (t) => { $("#err").textContent = t; $("#err").hidden = !t; };
  $("#host").onclick = async () => {
    err("");
    try {
      const g = await api("/api/games", { method: "POST", body: { quizId: q.id } });
      localStorage.setItem("kalakal:host:" + g.pin, g.hostKey);
      location.href = `/host.html?pin=${g.pin}`;
    } catch (e) { err(e.message); }
  };
  $("#copy").onclick = async () => {
    const m = await me();
    if (!m.user) return signIn();
    if (!m.user.acceptedTerms) { location.href = `/me.html?welcome=1&next=${encodeURIComponent(location.pathname + location.search)}`; return; }
    try { const c = await api(`/api/quizzes/${q.id}/copy`, { method: "POST" }); location.href = `/host.html?build=${q.mode === "pulse" ? "kural" : "play"}&quiz=${c.id}`; }
    catch (e) { err(e.message); }
  };
  $("#like").onclick = async () => {
    const m = await me();
    if (!m.user) return signIn();
    try { const r = await api(`/api/quizzes/${q.id}/like`, { method: "POST" }); $("#like").setAttribute("aria-pressed", String(r.liked)); $("#likes").textContent = r.likes; }
    catch (e) { err(e.message); }
  };
  $("#share").onclick = async () => {
    const url = location.href, text = `Play "${q.title}" on Kalakal`;
    if (navigator.share) return navigator.share({ title: q.title, text, url }).catch(() => {});
    try { await navigator.clipboard.writeText(url); $("#share").textContent = "Link copied!"; setTimeout(() => ($("#share").textContent = "Share"), 2500); }
    catch { prompt("Copy this link:", url); }
  };
  const rep = $("#report");
  if (rep) rep.onclick = () => $("#repDlg").showModal();
  $("#repSend").onclick = async () => {
    const reason = document.querySelector('input[name="reason"]:checked').value;
    try { await api(`/api/quizzes/${q.id}/report`, { method: "POST", body: { reason, note: $("#repNote").value } }); $("#repDlg").close(); rep.textContent = "Reported. Thank you"; rep.disabled = true; }
    catch (e) { $("#repDlg").close(); err(e.message); }
  };
  // creator link → their quizzes in the library search isn't supported by name; show their page in the library
  document.querySelectorAll("[data-creator]").forEach((a) => (a.href = `/creator.html?id=${a.dataset.creator}`));
}
render();
