// Admin: approve new creators' public quizzes, handle reports, see site numbers.
import { $, esc } from "/js/common.js";
import { mountNav, mountFooter, api, me } from "/js/account.js";

mountNav(); mountFooter();
const REASON = { wrong: "Wrong answers", offensive: "Offensive", copyright: "Copyright", spam: "Spam", other: "Other" };

function item(q, kind) {
  const answers = (s) => s.type === "quiz" ? `<div class="ans">${s.answers.map((a, i) => (s.correct.includes(i) ? `<b>✓ ${esc(a)}</b>` : esc(a))).join(" · ")}</div>`
    : s.answers ? `<div class="ans">${s.answers.map(esc).join(" · ")}</div>` : s.statements ? `<div class="ans">${s.statements.map(esc).join(" · ")}</div>` : "";
  return `<article class="item" data-id="${q.id}">
    <div class="row" style="justify-content: space-between"><h3 style="font-size: 20px">${esc(q.title)}</h3><span class="badge ${q.status}">${q.status === "review" ? "Waiting" : q.status === "hidden" ? "Hidden" : "Live"}</span></div>
    <p class="muted" style="font-size: 15px">${esc(q.categoryName)} · ${esc(q.language)} · ${q.questions} slide${q.questions === 1 ? "" : "s"} · by ${esc(q.creator ? q.creator.name : "?")} (${esc(q.creatorEmail || "")})</p>
    ${q.description ? `<p>${esc(q.description)}</p>` : ""}
    ${kind === "reported" ? `<div class="reps">${q.reportList.map((r) => `<p><strong>${REASON[r.reason] || r.reason}</strong>${r.note ? `: ${esc(r.note)}` : ""}</p>`).join("") || "<p>No open reports</p>"}</div>` : ""}
    <details><summary style="cursor: pointer; font-weight: 700">${q.slides.length === 1 ? "The question" : `All ${q.slides.length} questions`}</summary><ol>${q.slides.map((s) => `<li>${esc(s.text)}${answers(s)}${s.media && s.media.kind === "image" ? `<div><img src="${esc(s.media.src)}" alt="" style="max-width: 220px; border-radius: 10px; margin-top: 6px"></div>` : ""}</li>`).join("")}</ol></details>
    <div class="row">${kind === "review"
      ? '<button class="btn btn-primary btn-sm" type="button" data-act="approve">Approve</button><button class="btn btn-ghost btn-sm" type="button" data-act="hide">Reject (hide)</button>'
      : `${q.status === "hidden" ? '<button class="btn btn-primary btn-sm" type="button" data-act="restore">Restore</button>' : '<button class="btn btn-ghost btn-sm" type="button" data-act="hide">Hide</button><button class="btn btn-ghost btn-sm" type="button" data-act="dismiss">Dismiss reports</button>'}`}
      <a class="btn btn-ghost btn-sm" href="/quiz.html?id=${q.id}" target="_blank">Open page</a></div>
  </article>`;
}

async function load() {
  const m = await me();
  if (!m.user || !m.user.admin) { $("#main").innerHTML = `<div class="empty"><h1 style="font-size: 28px">Page not found</h1><a class="btn btn-primary" href="/">Home</a></div>`; return; }
  const d = await api("/api/admin/overview");
  const s = d.stats;
  $("#main").innerHTML = `
    <div><p class="eyebrow">Admin</p><h1 style="font-size: 38px">Kalakal control room</h1></div>
    <div class="stats">
      <div class="stat"><b>${s.users}</b><span>accounts (${s.newUsers7} new this week)</span></div>
      <div class="stat"><b>${s.quizzes}</b><span>saved quizzes</span></div>
      <div class="stat"><b>${s.public}</b><span>in the library</span></div>
      <div class="stat"><b>${s.playsToday}</b><span>library games today</span></div>
      <div class="stat"><b>${s.plays30}</b><span>library games, 30 days</span></div>
    </div>
    <section class="stack"><h2 style="font-size: 26px">Waiting for approval (${d.review.length})</h2><p class="muted">A new creator's first public quiz, or one the safety check wasn't sure about.</p>
      ${d.review.map((q) => item(q, "review")).join("") || '<p class="muted">Nothing waiting. 🎉</p>'}</section>
    <section class="stack"><h2 style="font-size: 26px">Reported (${d.reported.length})</h2><p class="muted">Quizzes with 3 open reports are hidden automatically until you decide.</p>
      ${d.reported.map((q) => item(q, "reported")).join("") || '<p class="muted">No reports.</p>'}</section>`;
}

$("#main").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.closest("[data-id]").dataset.id;
  b.disabled = true;
  try { await api(`/api/admin/quizzes/${id}`, { method: "POST", body: { action: b.dataset.act } }); await load(); }
  catch (ex) { alert(ex.message); b.disabled = false; }
});
load();
