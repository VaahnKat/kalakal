import { SHAPES, minni, esc, $, show, connect, ordinal, confetti } from "/js/common.js";

const params = new URLSearchParams(location.search);
let pin = (params.get("pin") || "").replace(/\D/g, "");
let me = null;          // { pid, name, color }
let conn = null;
let currentQ = -1;
let pendingName = "";

$("#pin").value = pin ? pin.replace(/(\d{3})(\d{3})/, "$1 $2") : "";
$("#waitMinni").innerHTML = minni("ready", 150);
if (pin) $("#nick").focus(); else $("#pin").focus();

// Resume a game after a refresh
const saved = pin && JSON.parse(localStorage.getItem("kalakal:" + pin) || "null");
if (saved && saved.pid) {
  fetch("/api/games/" + pin).then((r) => r.json()).then((r) => {
    if (r.exists) { me = saved; start(); } else localStorage.removeItem("kalakal:" + pin);
  }).catch(() => {});
}

$("#joinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  pin = $("#pin").value.replace(/\D/g, "");
  pendingName = $("#nick").value.trim();
  if (pin.length !== 6) return joinError("A game PIN has 6 digits.");
  if (pendingName.length < 2) return joinError("Pick a nickname with at least 2 characters.");
  $("#joinBtn").disabled = true;
  history.replaceState(null, "", "/play.html?pin=" + pin);
  start();
});

function joinError(text) {
  $("#joinErr").textContent = text; $("#joinErr").hidden = false; $("#joinBtn").disabled = false;
  show("join");
}

function start() {
  if (conn) conn.close();
  conn = connect(pin, "player", {
    onOpen: () => conn.send({ t: "join", pid: me && me.pid, name: pendingName || (me && me.name) }),
    onStatus: (s) => { $("#status").hidden = s === "online"; },
    onMessage,
  });
}

function setMe(m) {
  me = { pid: m.pid, name: m.name, color: m.color };
  localStorage.setItem("kalakal:" + pin, JSON.stringify(me));
  document.querySelectorAll(".me").forEach((el) => (el.textContent = me.name));
  document.querySelectorAll(".p-name .dot").forEach((el) => (el.style.background = me.color));
}

function onMessage(m) {
  switch (m.t) {
    case "joined": setMe(m); break;
    case "error":
      if (!me || !me.pid) { conn.close(); conn = null; joinError(m.message); }
      else message("Hmm.", m.message, "sad");
      break;
    case "lobby_wait":
      $("#waitCount").textContent = m.players + (m.players === 1 ? " player" : " players");
      $("#waitTitle").textContent = "You're in!";
      $("#waitText").textContent = "See your name on the big screen? The game starts soon.";
      show("wait");
      break;
    case "between":
      $("#waitTitle").textContent = "Next question coming up";
      $("#waitText").textContent = `You have ${m.score} points.`;
      show("wait");
      break;
    case "question": question(m); break;
    case "answer_ack": locked(m.choice); break;
    case "result": result(m); break;
    case "final": final(m); break;
    case "kicked":
      localStorage.removeItem("kalakal:" + pin);
      message("You were removed", "The host removed you from this game.", "sad");
      break;
  }
}

function question(m) {
  currentQ = m.index;
  $("#qCount").textContent = `${m.index + 1} / ${m.total}`;
  $("#qText").textContent = m.text;
  if (m.alreadyAnswered) { locked(null); return; }
  $("#pAnswers").innerHTML = m.answers.map((a, i) =>
    `<button class="answer a${i}" type="button" data-i="${i}">${SHAPES[i]}<span>${esc(a)}</span></button>`).join("");
  $("#pAnswers").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    const choice = Number(b.dataset.i);
    navigator.vibrate && navigator.vibrate(20);
    conn.send({ t: "answer", q: currentQ, choice });
    locked(choice);
  }, { once: true }));
  show("question");
}

function locked(choice) {
  const box = $("#lockedShape");
  const known = Number.isInteger(choice);
  box.className = known ? "a" + choice : "";
  box.style.background = known ? "" : "var(--night)";
  box.innerHTML = known ? SHAPES[choice].replace("<svg ", '<svg width="60" height="60" ') : minni("ready", 100);
  show("locked");
}

function result(m) {
  const el = $("#result");
  const cls = !m.answered ? "none" : m.correct ? "good" : "bad";
  el.className = "result " + cls;
  const streak = m.correct && m.streak > 1 ? `<p style="font-weight:800;font-size:20px">Streak ×${m.streak}</p>` : "";
  el.innerHTML = `
    <div>${minni(m.correct ? "happy" : m.answered ? "sad" : "hurry", 140)}</div>
    <p class="big">${m.correct ? "Kalakal!" : m.answered ? "Not this time" : "Time's up"}</p>
    ${m.correct ? `<p class="big" style="font-size:34px">+${m.points}</p>` : `<p style="font-weight:700;font-size:19px">Answer: ${esc(m.correctText)}</p>`}
    ${streak}
    <p style="font-weight:800;font-size:20px">You're ${ordinal(m.rank)} of ${m.players} · ${m.score} pts</p>`;
  navigator.vibrate && navigator.vibrate(m.correct ? [30, 40, 30] : 120);
  show("result");
}

function final(m) {
  const podium = m.rank <= 3;
  $("#final").innerHTML = `
    <div class="float">${minni(podium ? "happy" : "ready", 160)}</div>
    <p class="eyebrow">Final result</p>
    <h1 style="font-size: 40px">${ordinal(m.rank)} place</h1>
    <p style="font-family: var(--display); font-weight: 800; font-size: 28px; color: var(--marigold)">${m.score} points</p>
    <p class="muted">${podium ? "You made the podium. Kalakal!" : `Out of ${m.players} players. Great game!`}</p>
    <a class="btn btn-ghost" href="/host.html">Host your own game, free</a>`;
  if (podium) confetti(90);
  localStorage.removeItem("kalakal:" + pin);
  show("final");
}

function message(title, text, mood) {
  $("#msgMinni").innerHTML = minni(mood, 130);
  $("#msgTitle").textContent = title;
  $("#msgText").textContent = text;
  show("message");
}
