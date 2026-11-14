import { SHAPES, minni, esc, $, show, connect, ordinal, confetti } from "/js/common.js";
import { avatarSvg, randomAvatar, describeAvatar } from "/js/avatar.js";
import { funName, funNames } from "/js/names.js";

const params = new URLSearchParams(location.search);
let pin = (params.get("pin") || "").replace(/\D/g, "");
let me = null;          // { pid, name, color }
let conn = null;
let currentQ = -1;
let pendingName = "";

$("#pin").value = pin ? pin.replace(/(\d{3})(\d{3})/, "$1 $2") : "";
let myAvatar = Number(localStorage.getItem("kalakal:look"));
if (!Number.isInteger(myAvatar) || !localStorage.getItem("kalakal:look")) myAvatar = randomAvatar();
let funMode = false, spun = funName();

function drawLook() {
  $("#myAvatar").innerHTML = avatarSvg(myAvatar, { size: 104, mood: "wink", label: "Your character" });
  $("#lookName").textContent = describeAvatar(myAvatar);
  $("#waitMinni").innerHTML = avatarSvg(myAvatar, { size: 160, label: "Your character" });
  document.querySelectorAll(".me-av").forEach((el) => (el.innerHTML = avatarSvg(myAvatar, { size: 30 })));
  localStorage.setItem("kalakal:look", String(myAvatar));
}
function drawSuggestions() {
  $("#sugg").innerHTML = funNames(3).map((n) => `<button type="button">${esc(n)}</button>`).join("");
}
drawLook(); drawSuggestions();
$("#newLook").addEventListener("click", () => { myAvatar = randomAvatar(); drawLook(); });
$("#surprise").addEventListener("click", () => { $("#nick").value = funName(); drawSuggestions(); });
$("#sugg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { $("#nick").value = b.textContent; drawSuggestions(); } });
$("#spin").addEventListener("click", () => { spun = funName(); $("#funName").textContent = spun; $("#funName").style.animation = "none"; void $("#funName").offsetWidth; $("#funName").style.animation = ""; });
$("#waitLook").addEventListener("click", () => { myAvatar = randomAvatar(); drawLook(); conn && conn.send({ t: "avatar", avatar: myAvatar }); });

// Does this game use "fun names only"?
async function checkMode(code) {
  try {
    const r = await fetch("/api/games/" + code).then((r) => r.json());
    funMode = !!(r.exists && r.funNames);
    $("#nameField").hidden = funMode; $("#funField").hidden = !funMode;
    $("#nick").required = !funMode;
    if (funMode) $("#funName").textContent = spun;
  } catch {}
}
if (pin) checkMode(pin);
$("#pin").addEventListener("input", () => { const c = $("#pin").value.replace(/\D/g, ""); if (c.length === 6) checkMode(c); });
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
  pendingName = funMode ? spun : $("#nick").value.trim();
  if (pin.length !== 6) return joinError("A game PIN has 6 digits.");
  if (pendingName.length < 2) return joinError("Pick a nickname with at least 2 characters, or tap Surprise me.");
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
    onOpen: () => conn.send({ t: "join", pid: me && me.pid, name: pendingName || (me && me.name), avatar: myAvatar }),
    onStatus: (s) => { $("#status").hidden = s === "online"; },
    onMessage,
  });
}

function setMe(m) {
  me = { pid: m.pid, name: m.name, color: m.color };
  if (Number.isInteger(m.avatar)) myAvatar = m.avatar;
  localStorage.setItem("kalakal:" + pin, JSON.stringify(me));
  document.querySelectorAll(".me").forEach((el) => (el.textContent = me.name));
  drawLook();
}

function onMessage(m) {
  switch (m.t) {
    case "joined": setMe(m); break;
    case "avatar_ok": myAvatar = m.avatar; drawLook(); break;
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
    case "rematch": rematch(m); break;
    case "engage": engageStart(m); break;
    case "respond_ack": engageAck(m); break;
    case "respond_error": engageNote(m.message, true); break;
    case "qa_list": if (eng && eng.index === m.s) { eng.items = m.items; renderQa(); } break;
    case "thanks":
      localStorage.removeItem("kalakal:" + pin);
      message("Thanks for taking part!", "The session has finished. Kalakal!", "happy");
      break;
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
  const img = $("#qImg");
  if (m.media && m.media.kind === "image") { img.src = m.media.src; img.hidden = false; } else { img.hidden = true; img.removeAttribute("src"); }
  $("#qX2").hidden = !(m.points === 2 || m.points === 0);
  $("#qX2").textContent = m.points === 2 ? "Double points!" : "Warm-up: no points";
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

const MILESTONE_TEXT = {
  fastest: "Fastest right answer!", lead: "You took the lead!", top3: "You're in the top 3!", comeback: "What a comeback!",
  streak3: "On fire! 3 in a row", streak5: "Unstoppable! 5 in a row", streak7: "Legendary! 7 in a row",
};
function milestoneText(k) { return MILESTONE_TEXT[k] || (k.startsWith("streak") ? `Streak ×${k.slice(6)}!` : ""); }

function result(m) {
  const el = $("#result");
  const cls = !m.answered ? "none" : m.correct ? "good" : "bad";
  el.className = "result " + cls;
  const ms = m.milestones || [];
  const top = ms[0];
  const react = !m.correct ? (m.answered ? "wobble" : "idle") : top === "lead" ? "spin" : top && top.startsWith("streak") ? "fire" : top ? "dance" : "bounce";
  const mood = !m.correct ? (m.answered ? "sad" : "hurry") : top && top.startsWith("streak") ? "fire" : "happy";
  const streak = m.correct && m.streak > 1 && !(top && top.startsWith("streak")) ? `<p style="font-weight:800;font-size:20px">Streak ×${m.streak}</p>` : "";
  // Where the points came from, and something to aim for next
  const parts = m.correct && !m.noPoints ? `<p class="r-sub">${m.secs != null ? `Answered in ${m.secs} s` : ""}${m.bonus ? ` · streak bonus +${m.bonus}` : ""}</p>` : "";
  const lost = m.lostStreak ? `<p class="r-sub">Your streak of ${m.lostStreak} ended. Start a new one!</p>` : "";
  const c = m.chase;
  const chase = !c || !m.score ? "" : c.lead != null
    ? `<p class="r-chase">You lead by ${c.lead} pts. Stay fast!</p>`
    : c.gap === 0 ? `<p class="r-chase">Level with ${esc(c.name)}!</p>`
    : `<p class="r-chase">${c.gap <= 600 ? "Only " : ""}${c.gap} pts behind ${esc(c.name)}${c.gap <= 1000 ? ". One fast answer does it!" : ""}</p>`;
  const move = m.move > 0 ? ` <span class="r-up">▲ ${m.move}</span>` : "";
  el.innerHTML = `
    <div class="avw react-${react}">${avatarSvg(myAvatar, { size: 160, mood, label: "Your character" })}</div>
    <p class="big">${m.correct ? "Kalakal!" : m.answered ? "Not this time" : "Time's up"}</p>
    ${m.correct && m.noPoints ? `<p style="font-weight:700;font-size:19px">Warm-up round: no points</p>` : m.correct ? `<p class="big" style="font-size:34px">+${m.points}</p>` : `<p style="font-weight:700;font-size:19px">Answer: ${esc(m.correctText)}</p>`}
    ${parts}${lost}
    ${ms.slice(0, 2).map((k) => `<p class="milestone">${esc(milestoneText(k))}</p>`).join("")}
    ${streak}
    <p style="font-weight:800;font-size:20px">${ordinal(m.rank)} of ${m.players}${move} · ${m.score} pts</p>
    ${chase}`;
  navigator.vibrate && navigator.vibrate(ms.length ? [40, 50, 40, 50, 80] : m.correct ? [30, 40, 30] : 120);
  if (ms.includes("lead") || ms.some((k) => k.startsWith("streak5") || k.startsWith("streak7"))) confetti(60);
  show("result");
}

const AWARDS = { fastest: "Fastest fingers award", streak: "Streak master award", sharp: "Sharpshooter award" };
function final(m) {
  const podium = m.rank <= 3;
  const title = m.rank === 1 ? "Champion!" : `${ordinal(m.rank)} place`;
  const stats = m.total ? `<div class="f-stats">
      <div><strong>${m.correct}/${m.total}</strong><span>right</span></div>
      <div><strong>${m.best || 0}</strong><span>best streak</span></div>
      <div><strong>${m.avgSecs != null ? m.avgSecs + " s" : "–"}</strong><span>avg. speed</span></div></div>` : "";
  $("#final").innerHTML = `
    <div class="avw ${podium || m.award ? "react-dance react-glow" : "react-bounce"}">${avatarSvg(myAvatar, { size: 150, mood: podium || m.award ? "happy" : "wink", label: "Your character" })}</div>
    <p class="eyebrow">Final result</p>
    <h1 style="font-size: 40px">${title}</h1>
    <p style="font-family: var(--display); font-weight: 800; font-size: 28px; color: var(--marigold)">${m.score} points</p>
    ${m.award ? `<p class="milestone">${AWARDS[m.award]}</p>` : ""}
    ${m.perfect ? '<p class="milestone">Perfect game! Every answer right</p>' : ""}
    ${stats}
    <p class="muted">${podium ? "You made the podium. Kalakal!" : `Out of ${m.players} players. Great game!`}</p>
    <div id="rematch"></div>
    <a class="btn btn-ghost btn-block" href="/library.html">Find a quiz to host yourself</a>`;
  if (podium || m.perfect || m.award) confetti(110);
  localStorage.removeItem("kalakal:" + pin);
  show("final");
}
// The host started the same quiz again: one tap to join the new game
function rematch(m) {
  const box = $("#rematch"); if (!box) return;
  box.innerHTML = `<a class="btn btn-primary btn-block react-bounce" href="/play.html?pin=${encodeURIComponent(m.pin)}">Play again! Join the rematch</a>`;
  navigator.vibrate && navigator.vibrate([40, 60, 40]);
}

function message(title, text, mood) {
  $("#msgMinni").innerHTML = minni(mood, 130);
  $("#msgTitle").textContent = title;
  $("#msgText").textContent = text;
  show("message");
}

// ---------- interaction slides (Kalakal Pulse) ----------
let eng = null; // { index, slide, mine, left, items, myVotes:Set, myItems:Set, sent:[] }

function engageStart(m) {
  eng = { index: m.index, slide: m.slide, mine: m.mine ?? null, left: m.left, items: m.items || [], myVotes: new Set(m.myVotes || []), myItems: new Set(m.myItems || []), sent: [] };
  $("#eCount").textContent = `${m.index + 1} / ${m.total}`;
  $("#eText").textContent = m.slide.text;
  const s = m.slide, box = $("#eBox");
  if (s.type === "poll") {
    box.innerHTML = `<div class="e-opts">${s.answers.map((a, i) => `<button class="answer a${i}" type="button" data-i="${i}">${SHAPES[i]}<span>${esc(a)}</span></button>`).join("")}</div><p class="muted" id="eNote" role="status"></p>`;
    box.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => conn.send({ t: "respond", s: eng.index, choice: Number(b.dataset.i) })));
    if (eng.mine !== null) markPoll(eng.mine);
  } else if (s.type === "wordcloud" || s.type === "open" || s.type === "qa") {
    const isWord = s.type === "wordcloud", isQa = s.type === "qa";
    box.innerHTML = `
      <form class="stack" id="eForm" autocomplete="off">
        <label for="eInput">${isWord ? "Your word" : isQa ? "Your question" : "Your answer"}</label>
        ${isWord ? `<input id="eInput" type="text" maxlength="25" placeholder="One or two words" required>` : `<textarea id="eInput" maxlength="200" placeholder="${isQa ? "Ask anything" : "Type your answer"}" required></textarea>`}
        <button class="btn btn-primary btn-block" type="submit" id="eSend">${isQa ? "Ask" : "Send"}</button>
        <p class="muted" id="eNote" role="status"></p>
      </form>
      <div class="sent" id="eSent"></div>
      ${isQa ? '<p class="eyebrow" style="margin-top:8px">Questions · tap to upvote</p><div class="stack" id="qaList" style="gap:10px"></div>' : ""}`;
    $("#eForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("#eInput").value.trim(); if (!v) return;
      eng.pending = v;
      conn.send(isQa ? { t: "respond", s: eng.index, ask: v } : { t: "respond", s: eng.index, text: v });
      $("#eSend").disabled = true;
    });
    updateLeft();
    if (isQa) {
      renderQa();
      $("#qaList").addEventListener("click", (e) => {
        const b = e.target.closest("[data-vote]"); if (!b) return;
        conn.send({ t: "respond", s: eng.index, vote: Number(b.dataset.vote) });
      });
    }
  } else if (s.type === "scale") {
    const vals = eng.mine ? eng.mine.slice() : s.statements.map(() => null);
    box.innerHTML = s.statements.map((st, k) => `
      <div class="stack" style="gap:8px"><p style="font-weight:800">${esc(st)}</p>
        <div class="rate" role="group" aria-label="${esc(st)}">${[1, 2, 3, 4, 5].map((v) => `<button type="button" data-k="${k}" data-v="${v}" aria-pressed="${vals[k] === v}">${v}</button>`).join("")}</div>
        <div class="row" style="justify-content:space-between;font-size:14px"><span class="muted">${esc(s.low)}</span><span class="muted">${esc(s.high)}</span></div></div>`).join("")
      + `<button class="btn btn-primary btn-block" type="button" id="eRate" ${vals.every(Boolean) ? "" : "disabled"}>${eng.mine ? "Update" : "Send"}</button><p class="muted" id="eNote" role="status"></p>`;
    box.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => {
      const k = Number(b.dataset.k); vals[k] = Number(b.dataset.v);
      box.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.v) === vals[k])));
      $("#eRate").disabled = !vals.every(Boolean);
    }));
    $("#eRate").addEventListener("click", () => conn.send({ t: "respond", s: eng.index, values: vals }));
    if (eng.mine) engageNote("Thanks! You can change your ratings and send again.");
  }
  show("engage");
}

function markPoll(choice) {
  document.querySelectorAll("#eBox [data-i]").forEach((b) => {
    const on = Number(b.dataset.i) === choice;
    b.classList.toggle("chosen", on); b.classList.toggle("dim", !on);
  });
  engageNote("Vote sent. Tap another option to change it.");
}

function engageNote(text, isError = false) {
  const n = $("#eNote"); if (!n) return;
  n.textContent = text; n.className = isError ? "error" : "ok-note";
  const send = $("#eSend"); if (send && isError) send.disabled = false;
}

function updateLeft() {
  const left = eng.left;
  const input = $("#eInput"), send = $("#eSend");
  if (!input) return;
  const done = left <= 0;
  input.disabled = done; send.disabled = done;
  if (done) engageNote(eng.slide.type === "qa" ? "Thanks! You've asked the maximum number of questions." : "Thanks! You've sent all your answers.");
  else if (eng.sent.length) engageNote(`Sent! You can send ${left} more.`);
}

function engageAck(m) {
  if (!eng || m.s !== eng.index) return;
  const s = eng.slide;
  if (s.type === "poll") { eng.mine = m.choice; markPoll(m.choice); navigator.vibrate && navigator.vibrate(20); return; }
  if (s.type === "scale") { eng.mine = m.values; $("#eRate").textContent = "Update"; engageNote("Thanks! You can change your ratings and send again."); return; }
  if (m.vote !== undefined) { if (m.on) eng.myVotes.add(m.vote); else eng.myVotes.delete(m.vote); renderQa(); return; }
  if (m.left !== undefined) {
    eng.left = m.left;
    if (eng.pending) { eng.sent.push(eng.pending); eng.pending = null; }
    $("#eInput").value = "";
    $("#eSent").innerHTML = eng.sent.map((t) => `<span>${esc(t)}</span>`).join("");
    $("#eSend").disabled = false;
    navigator.vibrate && navigator.vibrate(20);
    updateLeft();
  }
}

function renderQa() {
  const list = $("#qaList"); if (!list || !eng) return;
  list.innerHTML = eng.items.length ? eng.items.map((x) => {
    const mine = eng.sent.includes(x.text) || eng.myItems.has(x.id);
    return `<div class="qa-item ${x.answered ? "done" : ""}">
      ${mine ? `<span class="up" style="display:flex;align-items:center;justify-content:center">${x.votes}</span>` : `<button class="up" type="button" data-vote="${x.id}" aria-pressed="${eng.myVotes.has(x.id)}" aria-label="Upvote, ${x.votes} votes">▲ ${x.votes}</button>`}
      <span style="flex:1;font-weight:600">${esc(x.text)}${x.answered ? ' <span class="muted">· answered</span>' : mine ? ' <span class="muted">· yours</span>' : ""}</span></div>`;
  }).join("") : '<p class="muted">No questions yet. Be the first!</p>';
}
