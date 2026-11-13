// Home page: join with a PIN, account menu, popular quizzes.
import { mountNav, mountFooter, api, cardHtml } from "/js/account.js";
mountNav(); mountFooter();
api("/api/library?sort=trending&limit=8").then((d) => {
  let list = d.quizzes;
  if (list.length < 4) return api("/api/library?sort=popular&limit=8").then((p) => p.quizzes);
  return list;
}).then((list) => {
  if (!list || !list.length) return;
  document.getElementById("popularGrid").innerHTML = list.map(cardHtml).join("");
  document.getElementById("popular").hidden = false;
}).catch(() => {});
  document.getElementById("join").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = document.getElementById("pin").value.replace(/\D/g, "");
    const err = document.getElementById("err");
    err.hidden = true;
    if (pin.length !== 6) { err.textContent = "A game PIN has 6 digits."; err.hidden = false; return; }
    try {
      const r = await fetch("/api/games/" + pin).then((r) => r.json());
      if (!r.exists) { err.textContent = "We couldn't find that game. Check the PIN on the big screen."; err.hidden = false; return; }
      location.href = "/play.html?pin=" + pin;
    } catch { err.textContent = "Connection problem. Try again."; err.hidden = false; }
  });
