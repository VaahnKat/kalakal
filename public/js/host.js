import { SHAPES, SHAPE_NAMES, minni, esc, $, show, connect, startTimer, confetti } from "/js/common.js";
import { DEMO_QUIZ, blankQuestion } from "/js/quizzes.js";

const params = new URLSearchParams(location.search);
let pin = (params.get("pin") || "").replace(/\D/g, "");
let conn = null;
let players = [];
let locked = false;
let stopTimer = null;
let lastResults = [];

$("#demoTitle").textContent = DEMO_QUIZ.title;
$("#lobbyMinni").innerHTML = minni("ready", 90);
$("#qMinni").innerHTML = minni("ready", 130);

// ---------- setup ----------
$("#playDemo").addEventListener("click", () => createGame(DEMO_QUIZ, $("#setupErr")));
$("#openEditor").addEventListener("click", () => { renderEditor(); show("editor"); });
$("#backToSetup").addEventListener("click", () => show("setup"));

let draft = JSON.parse(localStorage.getItem("kalakal:draft") || "null") || { title: "", questions: [blankQuestion()] };
const saveDraft = () => { localStorage.setItem("kalakal:draft", JSON.stringify(draft)); $("#draftNote").textContent = "Draft saved"; };

function renderEditor() {
  $("#quizTitle").value = draft.title;
  $("#qList").innerHTML = draft.questions.map((q, qi) => `
    <div class="card q-card" data-q="${qi}">
      <div class="q-head"><p class="eyebrow">Question ${qi + 1}</p>
        <div class="row"><label class="muted" for="t${qi}" style="font-weight:600">Time</label>
          <select id="t${qi}" data-f="time">${[10, 15, 20, 30, 45, 60].map((s) => `<option value="${s}" ${s === q.time ? "selected" : ""}>${s} s</option>`).join("")}</select>
          <button class="icon-btn" type="button" data-f="remove" aria-label="Remove question ${qi + 1}">Remove</button></div></div>
      <input type="text" data-f="text" maxlength="200" placeholder="Type your question" value="${esc(q.text)}" aria-label="Question ${qi + 1} text">
      <div class="q-answers">${q.answers.map((a, ai) => `
        <div class="q-ans a${ai}">${SHAPES[ai]}
          <input type="text" data-f="ans" data-a="${ai}" maxlength="80" placeholder="Answer ${ai + 1}${ai > 1 ? " (optional)" : ""}" value="${esc(a)}" aria-label="Question ${qi + 1}, answer ${ai + 1} (${SHAPE_NAMES[ai]})">
          <label class="ok"><input type="radio" name="c${qi}" data-f="correct" data-a="${ai}" ${q.correct === ai ? "checked" : ""}>Correct</label>
        </div>`).join("")}</div>
    </div>`).join("");
}

$("#quizTitle").addEventListener("input", (e) => { draft.title = e.target.value; saveDraft(); });
$("#qList").addEventListener("input", (e) => {
  const card = e.target.closest("[data-q]"); if (!card) return;
  const q = draft.questions[Number(card.dataset.q)], f = e.target.dataset.f;
  if (f === "text") q.text = e.target.value;
  if (f === "ans") q.answers[Number(e.target.dataset.a)] = e.target.value;
  if (f === "time") q.time = Number(e.target.value);
  if (f === "correct") q.correct = Number(e.target.dataset.a);
  saveDraft();
});
$("#qList").addEventListener("click", (e) => {
  if (e.target.dataset.f !== "remove") return;
  const i = Number(e.target.closest("[data-q]").dataset.q);
  draft.questions.splice(i, 1);
  if (!draft.questions.length) draft.questions.push(blankQuestion());
  saveDraft(); renderEditor();
});
$("#addQ").addEventListener("click", () => {
  draft.questions.push(blankQuestion()); saveDraft(); renderEditor();
  const inputs = document.querySelectorAll('#qList [data-f="text"]'); inputs[inputs.length - 1].focus();
});
$("#playCustom").addEventListener("click", () => {
  const err = $("#editErr"); err.hidden = true;
  const questions = [];
  for (const [i, q] of draft.questions.entries()) {
    if (!q.text.trim() && q.answers.every((a) => !a.trim())) continue; // skip empty cards
    const filled = q.answers.map((a, ai) => ({ a: a.trim(), ai })).filter((x) => x.a);
    if (!q.text.trim()) return fail(`Question ${i + 1} needs some text.`);
    if (filled.length < 2) return fail(`Question ${i + 1} needs at least 2 answers.`);
    const correct = filled.findIndex((x) => x.ai === q.correct);
    if (correct < 0) return fail(`Question ${i + 1}: the answer marked correct is empty.`);
    questions.push({ text: q.text.trim(), answers: filled.map((x) => x.a), correct, time: q.time });
  }
  if (!questions.length) return fail("Write at least one question.");
  createGame({ title: draft.title.trim() || "My Kalakal quiz", questions }, err);
  function fail(t) { err.textContent = t; err.hidden = false; }
});

async function createGame(quiz, errEl) {
  errEl.hidden = true;
  try {
    const res = await fetch("/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quiz }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not create the game");
    localStorage.setItem("kalakal:host:" + data.pin, data.hostKey);
    pin = data.pin;
    history.replaceState(null, "", "/host.html?pin=" + pin);
    openGame();
  } catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
}

// ---------- live game ----------
function openGame() {
  const key = localStorage.getItem("kalakal:host:" + pin);
  if (!key) { message("Not your game", "This browser didn't create game " + pin + ".", "sad"); return; }
  $("#bigPin").textContent = pin.replace(/(\d{3})(\d{3})/, "$1 $2");
  $("#joinHost").textContent = location.host;
  const joinUrl = `${location.origin}/play.html?pin=${pin}`;
  try { const qr = qrcode(0, "M"); qr.addData(joinUrl); qr.make(); $("#qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { console.error(e); }
  conn = connect(pin, "host", {
    onOpen: () => conn.send({ t: "host_hello", key }),
    onMessage,
  });
}

function onMessage(m) {
  switch (m.t) {
    case "snapshot":
      $("#lobbyTitle").textContent = m.title;
      players = m.players; locked = m.locked; renderLobby();
      if (m.phase === "lobby") show("lobby");
      else if (m.phase === "question") question({ ...m.question, total: m.total, players: players.length });
      else if (m.phase === "podium") conn.send({ t: "end" });
      else { message("Game in progress", "Continue to the next screen.", "ready", true); }
      break;
    case "lobby": players = m.players; locked = m.locked; renderLobby(); break;
    case "question": question(m); break;
    case "answer_count": $("#answered").textContent = `${m.answered} of ${m.players} answered`; break;
    case "reveal": reveal(m); break;
    case "leaderboard": board(m); break;
    case "podium": podium(m); break;
    case "error": message("Can't open this game", m.message, "sad"); break;
  }
}

function renderLobby() {
  $("#pCount").textContent = players.length;
  $("#startBtn").disabled = players.length === 0;
  $("#lockBtn").textContent = locked ? "Unlock lobby" : "Lock lobby";
  $("#kickHint").hidden = players.length === 0;
  $("#chips").innerHTML = players.length
    ? players.map((p) => `<button class="chip ${p.connected ? "" : "off"}" type="button" data-id="${esc(p.id)}" aria-label="Remove ${esc(p.name)}"><span class="dot" style="background:${p.color}">${esc(p.name.charAt(0).toUpperCase())}</span>${esc(p.name)}</button>`).join("")
    : '<p class="muted">Waiting for players to join…</p>';
}
$("#chips").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-id]"); if (!chip) return;
  const p = players.find((x) => x.id === chip.dataset.id);
  if (p && confirm(`Remove ${p.name} from the game?`)) conn.send({ t: "kick", id: p.id });
});
$("#lockBtn").addEventListener("click", () => conn.send({ t: "lock", locked: !locked }));
$("#startBtn").addEventListener("click", () => conn.send({ t: "start" }));
$("#skipBtn").addEventListener("click", () => conn.send({ t: "skip" }));
$("#toBoard").addEventListener("click", () => conn.send({ t: "next" }));
$("#nextBtn").addEventListener("click", () => conn.send({ t: "next" }));
$("#endBtn").addEventListener("click", () => { if (confirm("End the game and show the podium?")) conn.send({ t: "end" }); });
$("#msgNext").addEventListener("click", () => conn.send({ t: "next" }));

function answerTiles(answers, cls = () => "") {
  return answers.map((a, i) => `<div class="answer a${i} ${cls(i)}">${SHAPES[i]}<span>${esc(a)}</span></div>`).join("");
}

function question(m) {
  $("#qNum").textContent = `Question ${m.index + 1} of ${m.total}`;
  $("#qTitle").textContent = m.text;
  $("#qAnswers").innerHTML = answerTiles(m.answers);
  $("#answered").textContent = `${m.answered || 0} of ${m.players} answered`;
  $("#qMinni").innerHTML = minni("ready", 130);
  stopTimer && stopTimer();
  stopTimer = startTimer($("#timer"), m.time * 1000, m.remaining, null);
  const hurryAt = Math.max(0, m.remaining - 5000);
  clearTimeout(question.hurry);
  question.hurry = setTimeout(() => { $("#qMinni").innerHTML = minni("hurry", 130); }, hurryAt);
  show("question");
}

function reveal(m) {
  stopTimer && stopTimer(); clearTimeout(question.hurry);
  const total = Math.max(1, m.counts.reduce((a, b) => a + b, 0));
  $("#rNum").textContent = `Question ${m.index + 1}`;
  $("#rTitle").textContent = m.text;
  $("#bars").innerHTML = m.answers.map((a, i) => `
    <div class="bar-row" style="${i === m.correct ? "" : "opacity:.45"}">
      <div style="flex: 0 0 34%; display:flex; align-items:center; gap:12px; font-weight:800; font-size:22px">${SHAPES[i].replace("<svg ", '<svg width="26" height="26" style="filter:invert(1)" ')}${esc(a)}${i === m.correct ? ' <span class="pill" style="margin-left:6px">Correct</span>' : ""}</div>
      <div style="flex:1"><div class="bar a${i}" data-w="${(m.counts[i] / total) * 100}" style="width:0">${m.counts[i]}</div></div>
    </div>`).join("");
  $("#toBoard").textContent = "Show scores";
  show("reveal");
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll("#bars .bar").forEach((b) => (b.style.width = `max(48px, ${b.dataset.w}%)`))));
}

function board(m) {
  $("#bNum").textContent = `After question ${m.index + 1} of ${m.total}`;
  $("#board").innerHTML = m.top.length ? m.top.map((p, i) => `
    <div class="lb-row rise" style="animation-delay:${i * 80}ms">
      <span class="rank">${i + 1}</span><span class="dot" style="width:16px;height:16px;border-radius:99px;background:${p.color}"></span>
      <span>${esc(p.name)}</span>${p.streak > 1 ? `<span class="pill" style="background:var(--coral);font-size:15px">Streak ×${p.streak}</span>` : ""}
      <span class="score">${p.score}</span></div>`).join("") : '<p class="muted">No players yet.</p>';
  $("#nextBtn").textContent = m.last ? "Show podium" : "Next question";
  show("board");
}

function podium(m) {
  lastResults = m.results || [];
  const order = [1, 0, 2];
  const heights = ["260px", "190px", "140px"];
  const colors = ["#FFB627", "#19D3C5", "#FF5D73"];
  $("#podium").innerHTML = order.filter((i) => m.top[i]).map((i) => `
    <div class="pod rise" style="animation-delay:${[600, 1200, 0][i]}ms">
      <p class="who">${esc(m.top[i].name)}</p><p style="font-family:var(--display);font-weight:800;font-size:22px">${m.top[i].score}</p>
      <div class="block" style="height:${heights[i]};background:${colors[i]}">${i + 1}</div>
    </div>`).join("");
  show("podium");
  setTimeout(() => confetti(160), 1300);
}

$("#csvBtn").addEventListener("click", () => {
  const rows = [["Rank", "Nickname", "Score"], ...lastResults.map((r) => [r.rank, r.name, r.score])];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `kalakal-${pin}-results.csv`; a.click();
});

function message(title, text, mood, withNext = false) {
  $("#msgMinni").innerHTML = minni(mood, 130);
  $("#msgTitle").textContent = title; $("#msgText").textContent = text;
  $("#msgNext").hidden = !withNext;
  show("message");
}

// Resume after a refresh
if (pin) openGame(); else show("setup");
