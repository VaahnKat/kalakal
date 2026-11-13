// Public quiz library: search, categories, language/age filters, sort, paging.
import { $, esc } from "/js/common.js";
import { mountNav, mountFooter, api, cardHtml, CAT_ORDER } from "/js/account.js";

mountNav("library"); mountFooter();

const params = new URLSearchParams(location.search);
const state = { q: params.get("q") || "", category: params.get("category") || "", language: params.get("language") || "", age: params.get("age") || "", sort: params.get("sort") || "popular", page: 0 };
let categories = {};

$("#q").value = state.q; $("#age").value = state.age;

function syncUrl() {
  const p = new URLSearchParams();
  for (const k of ["q", "category", "language", "age"]) if (state[k]) p.set(k, state[k]);
  if (state.sort !== "popular") p.set("sort", state.sort);
  history.replaceState(null, "", `/library.html${p.toString() ? "?" + p : ""}`);
}

function renderCats() {
  $("#cats").innerHTML = [["", "All"], ...CAT_ORDER.filter((k) => categories[k]).map((k) => [k, categories[k]])]
    .map(([k, label]) => `<button class="cat" type="button" data-cat="${k}" aria-pressed="${state.category === k}">${esc(label)}</button>`).join("");
}

async function load(append = false) {
  if (!append) state.page = 0;
  const p = new URLSearchParams({ sort: state.sort, page: String(state.page) });
  for (const k of ["q", "category", "language", "age"]) if (state[k]) p.set(k, state[k]);
  try {
    const data = await api(`/api/library?${p}`);
    if (!Object.keys(categories).length) { categories = data.categories; renderCats(); }
    const langSel = $("#lang");
    if (langSel.options.length === 1) {
      for (const l of data.languages) langSel.insertAdjacentHTML("beforeend", `<option>${esc(l)}</option>`);
      langSel.value = state.language;
    }
    const html = data.quizzes.map(cardHtml).join("");
    if (append) $("#grid").insertAdjacentHTML("beforeend", html);
    else $("#grid").innerHTML = html || `<div class="empty" style="grid-column: 1 / -1"><img class="mascot" src="/img/mascots/explorer-thinking.webp" alt="" width="110" height="162"><h2 style="font-size: 24px">No quizzes here yet</h2><p class="muted">${state.q || state.category ? "Try another search or category." : "Be the first: make a quiz and set it to Public."}</p><a class="btn btn-primary" href="/host.html?build=play">Create a quiz</a></div>`;
    $("#more").hidden = !data.more;
  } catch (e) {
    $("#grid").innerHTML = `<div class="empty" style="grid-column: 1 / -1"><p class="muted">${esc(e.message)}</p></div>`;
  }
  syncUrl();
}

$("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); state.q = $("#q").value.trim(); state.language = $("#lang").value; state.age = $("#age").value; load(); });
$("#lang").addEventListener("change", () => { state.language = $("#lang").value; load(); });
$("#age").addEventListener("change", () => { state.age = $("#age").value; load(); });
$("#cats").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (!b) return; state.category = b.dataset.cat; renderCats(); load(); });
document.querySelectorAll("[data-sort]").forEach((b) => {
  b.setAttribute("aria-pressed", String(b.dataset.sort === state.sort));
  b.addEventListener("click", () => { state.sort = b.dataset.sort; document.querySelectorAll("[data-sort]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); load(); });
});
$("#more").addEventListener("click", () => { state.page++; load(true); });
load();
