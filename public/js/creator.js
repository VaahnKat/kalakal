// A creator's public quizzes.
import { $, esc } from "/js/common.js";
import { mountNav, mountFooter, api, cardHtml } from "/js/account.js";
mountNav("library"); mountFooter();
const id = new URLSearchParams(location.search).get("id") || "";
try {
  const d = await api(`/api/creators/${encodeURIComponent(id)}`);
  document.title = `${d.creator.name} · Kalakal`;
  $("#main").innerHTML = `<div class="row" style="gap: 16px">${d.creator.picture ? `<img src="${esc(d.creator.picture)}" alt="" width="64" height="64" style="border-radius:50%" referrerpolicy="no-referrer">` : ""}<div><p class="eyebrow">Creator</p><h1 style="font-size: 36px">${esc(d.creator.name)}</h1></div></div>
    <p class="muted">${d.quizzes.length} public quiz${d.quizzes.length === 1 ? "" : "zes"}</p><div class="q-cards">${d.quizzes.map(cardHtml).join("")}</div>`;
} catch (e) { $("#main").innerHTML = `<div class="empty"><h1 style="font-size: 28px">Creator not found</h1><a class="btn btn-primary" href="/library.html">Browse the library</a></div>`; }
