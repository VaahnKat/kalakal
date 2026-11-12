import { SHAPES, SHAPE_NAMES, minni, esc, $, show, connect, startTimer, confetti } from "/js/common.js";
import { DEMO_QUIZ, DEMO_MEETING, SLIDE_TYPES, TYPE_LABEL, blankSlide } from "/js/quizzes.js";

const params = new URLSearchParams(location.search);
let pin = (params.get("pin") || "").replace(/\D/g, "");
let conn = null;
let players = [];
let locked = false;
let stopTimer = null;
let lastResults = [];   // quiz ranking
let lastSummary = [];   // per-slide results
let engage = null;      // current interaction slide { index, total, slide }

$("#demoTitle").textContent = DEMO_QUIZ.title;
$("#meetTitle").textContent = DEMO_MEETING.title;
$("#lobbyMinni").innerHTML = minni("ready", 90);
$("#qMinni").innerHTML = minni("ready", 130);

// ---------- setup ----------
$("#playDemo").addEventListener("click", () => createGame(DEMO_QUIZ, $("#setupErr")));
$("#playMeeting").addEventListener("click", () => createGame(DEMO_MEETING, $("#setupErr")));
$("#openEditor").addEventListener("click", () => { renderEditor(); show("editor"); });
$("#backToSetup").addEventListener("click", () => show("setup"));

let draft = JSON.parse(localStorage.getItem("kalakal:draft") || "null") || { title: "", questions: [blankSlide("quiz")] };
draft.questions.forEach((q) => { if (!q.type) q.type = "quiz"; });
const saveDraft = () => { localStorage.setItem("kalakal:draft", JSON.stringify(draft)); $("#draftNote").textContent = "Draft saved"; };

$("#typePicker").innerHTML = SLIDE_TYPES.map((t) => `<button class="type-btn" type="button" data-type="${t.type}"><strong>${t.label}</strong><span>${t.hint}</span></button>`).join("");
$("#typePicker").addEventListener("click", (e) => {
  const b = e.target.closest("[data-type]"); if (!b) return;
  draft.questions.push(blankSlide(b.dataset.type)); saveDraft(); renderEditor();
  const inputs = document.querySelectorAll('#qList [data-f="text"]'); inputs[inputs.length - 1].focus();
});

function slideFields(q, qi) {
  const n = qi + 1;
  if (q.type === "quiz" || q.type === "poll") {
    return `<div class="q-answers">${q.answers.map((a, ai) => `
      <div class="q-ans a${ai}">${SHAPES[ai]}
        <input type="text" data-f="ans" data-a="${ai}" maxlength="80" placeholder="${q.type === "poll" ? "Option" : "Answer"} ${ai + 1}${ai > 1 ? " (optional)" : ""}" value="${esc(a)}" aria-label="Slide ${n}, ${q.type === "poll" ? "option" : "answer"} ${ai + 1} (${SHAPE_NAMES[ai]})">
        ${q.type === "quiz" ? `<label class="ok"><input type="radio" name="c${qi}" data-f="correct" data-a="${ai}" ${q.correct === ai ? "checked" : ""}>Correct</label>` : ""}
      </div>`).join("")}</div>`;
  }
  if (q.type === "scale") {
    return `<div class="stack" style="gap:10px">${q.statements.concat(q.statements.length < 4 ? [""] : []).slice(0, 4).map((st, si) => `
      <input type="text" data-f="stmt" data-a="${si}" maxlength="80" placeholder="Statement ${si + 1}${si > 0 ? " (optional)" : ""}" value="${esc(st)}" aria-label="Slide ${n}, statement ${si + 1}">`).join("")}
      <div class="row" style="flex-wrap:nowrap"><input type="text" data-f="low" maxlength="24" value="${esc(q.low)}" aria-label="Label for 1"><span class="muted" style="white-space:nowrap">1 to 5</span><input type="text" data-f="high" maxlength="24" value="${esc(q.high)}" aria-label="Label for 5"></div></div>`;
  }
  const hint = { wordcloud: "Players send up to 3 short words each.", open: "Players send up to 3 answers each, shown as cards.", qa: "Players ask questions and upvote each other's. You mark them answered." }[q.type];
  return `<p class="muted">${hint}</p>`;
}

function renderEditor() {
  $("#quizTitle").value = draft.title;
  $("#qList").innerHTML = draft.questions.map((q, qi) => `
    <div class="card q-card" data-q="${qi}">
      <div class="q-head"><div class="row"><p class="eyebrow">Slide ${qi + 1}</p><span class="type-tag">${TYPE_LABEL[q.type]}</span></div>
        <div class="row">${q.type === "quiz" ? `<label class="muted" for="t${qi}" style="font-weight:600">Time</label>
          <select id="t${qi}" data-f="time">${[10, 15, 20, 30, 45, 60].map((s) => `<option value="${s}" ${s === q.time ? "selected" : ""}>${s} s</option>`).join("")}</select>` : ""}
          ${qi > 0 ? `<button class="icon-btn" type="button" data-f="up" aria-label="Move slide ${qi + 1} up">Move up</button>` : ""}
          <button class="icon-btn" type="button" data-f="remove" aria-label="Remove slide ${qi + 1}">Remove</button></div></div>
      <input type="text" data-f="text" maxlength="200" placeholder="${{ quiz: "Type your question", poll: "What do you want to ask?", wordcloud: "e.g. One word for this week", open: "e.g. What should we start doing?", scale: "e.g. How are we doing?", qa: "e.g. Ask me anything" }[q.type]}" value="${esc(q.text)}" aria-label="Slide ${qi + 1} question">
      ${slideFields(q, qi)}
    </div>`).join("");
}

$("#quizTitle").addEventListener("input", (e) => { draft.title = e.target.value; saveDraft(); });
$("#qList").addEventListener("input", (e) => {
  const card = e.target.closest("[data-q]"); if (!card) return;
  const q = draft.questions[Number(card.dataset.q)], f = e.target.dataset.f, a = Number(e.target.dataset.a);
  if (f === "text") q.text = e.target.value;
  if (f === "ans") q.answers[a] = e.target.value;
  if (f === "time") q.time = Number(e.target.value);
  if (f === "correct") q.correct = a;
  if (f === "low") q.low = e.target.value;
  if (f === "high") q.high = e.target.value;
  if (f === "stmt") {
    const grow = a === q.statements.length && q.statements.length < 4;
    q.statements[a] = e.target.value;
    saveDraft();
    if (grow) { renderEditor(); const el = document.querySelector(`[data-q="${card.dataset.q}"] [data-f="stmt"][data-a="${a}"]`); el.focus(); el.setSelectionRange(99, 99); }
    return;
  }
  saveDraft();
});
$("#qList").addEventListener("click", (e) => {
  const f = e.target.dataset.f; if (f !== "remove" && f !== "up") return;
  const i = Number(e.target.closest("[data-q]").dataset.q);
  if (f === "remove") { draft.questions.splice(i, 1); if (!draft.questions.length) draft.questions.push(blankSlide("quiz")); }
  if (f === "up") [draft.questions[i - 1], draft.questions[i]] = [draft.questions[i], draft.questions[i - 1]];
  saveDraft(); renderEditor();
});

$("#playCustom").addEventListener("click", () => {
  const err = $("#editErr"); err.hidden = true;
  const out = [];
  for (const [i, q] of draft.questions.entries()) {
    const n = i + 1, text = (q.text || "").trim();
    const blank = !text && (q.answers || []).every((a) => !a.trim()) && (q.statements || []).every((s) => !s.trim());
    if (blank) continue;
    if (!text) return fail(`Slide ${n} needs a question.`);
    if (q.type === "quiz" || q.type === "poll") {
      const filled = q.answers.map((a, ai) => ({ a: a.trim(), ai })).filter((x) => x.a);
      if (filled.length < 2) return fail(`Slide ${n} needs at least 2 ${q.type === "poll" ? "options" : "answers"}.`);
      if (q.type === "quiz") {
        const correct = filled.findIndex((x) => x.ai === q.correct);
        if (correct < 0) return fail(`Slide ${n}: the answer marked correct is empty.`);
        out.push({ type: "quiz", text, answers: filled.map((x) => x.a), correct, time: q.time });
      } else out.push({ type: "poll", text, answers: filled.map((x) => x.a) });
    } else if (q.type === "scale") {
      const statements = q.statements.map((s) => s.trim()).filter(Boolean);
      if (!statements.length) return fail(`Slide ${n} needs at least one statement to rate.`);
      out.push({ type: "scale", text, statements, low: q.low, high: q.high });
    } else out.push({ type: q.type, text });
  }
  if (!out.length) return fail("Add at least one slide.");
  createGame({ title: draft.title.trim() || "My Kalakal session", questions: out }, err);
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

// ---------- live session ----------
function openGame() {
  const key = localStorage.getItem("kalakal:host:" + pin);
  if (!key) { message("Not your game", "This browser didn't create game " + pin + ".", "sad"); return; }
  $("#bigPin").textContent = pin.replace(/(\d{3})(\d{3})/, "$1 $2");
  $("#joinHost").textContent = location.host;
  $("#eJoin").textContent = `Join at ${location.host} · PIN ${pin.replace(/(\d{3})(\d{3})/, "$1 $2")}`;
  const joinUrl = `${location.origin}/play.html?pin=${pin}`;
  try { const qr = qrcode(0, "M"); qr.addData(joinUrl); qr.make(); $("#qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { console.error(e); }
  conn = connect(pin, "host", { onOpen: () => conn.send({ t: "host_hello", key }), onMessage });
}

function onMessage(m) {
  switch (m.t) {
    case "snapshot":
      $("#lobbyTitle").textContent = m.title;
      players = m.players; locked = m.locked; renderLobby();
      if (m.phase === "lobby") show("lobby");
      else if (m.phase === "question") question({ ...m.question, total: m.total, players: players.length });
      else if (m.phase === "engage") engageStart(m.engage);
      else if (m.phase === "podium" || m.phase === "finished") conn.send({ t: "end" });
      else message("Session in progress", "Continue to the next screen.", "ready", true);
      break;
    case "lobby": players = m.players; locked = m.locked; renderLobby(); if (engage) setCount(); break;
    case "question": engage = null; question(m); break;
    case "answer_count": $("#answered").textContent = `${m.answered} of ${m.players} answered`; break;
    case "reveal": reveal(m); break;
    case "leaderboard": board(m); break;
    case "engage": engageStart(m); break;
    case "results": if (engage && m.index === engage.index) { engage.results = m.results; renderResults(); } break;
    case "podium": lastSummary = m.summary || []; podium(m); break;
    case "finished": lastSummary = m.summary || []; finished(m); break;
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
$("#eNext").addEventListener("click", () => conn.send({ t: "next" }));
$("#endBtn").addEventListener("click", () => { if (confirm("End the session now?")) conn.send({ t: "end" }); });
$("#msgNext").addEventListener("click", () => conn.send({ t: "next" }));

// ----- quiz screens -----
function answerTiles(answers) {
  return answers.map((a, i) => `<div class="answer a${i}">${SHAPES[i]}<span>${esc(a)}</span></div>`).join("");
}

function question(m) {
  $("#qNum").textContent = `Question ${m.index + 1} of ${m.total}`;
  $("#qTitle").textContent = m.text;
  $("#qAnswers").innerHTML = answerTiles(m.answers);
  $("#answered").textContent = `${m.answered || 0} of ${m.players} answered`;
  $("#qMinni").innerHTML = minni("ready", 130);
  stopTimer && stopTimer();
  stopTimer = startTimer($("#timer"), m.time * 1000, m.remaining, null);
  clearTimeout(question.hurry);
  question.hurry = setTimeout(() => { $("#qMinni").innerHTML = minni("hurry", 130); }, Math.max(0, m.remaining - 5000));
  show("question");
}

function barsHtml(answers, counts, highlight) {
  const total = Math.max(1, counts.reduce((a, b) => a + b, 0));
  return answers.map((a, i) => `
    <div class="bar-row" style="${highlight === undefined || i === highlight ? "" : "opacity:.45"}">
      <div style="flex: 0 0 34%; display:flex; align-items:center; gap:12px; font-weight:800; font-size:22px">${SHAPES[i].replace("<svg ", '<svg width="26" height="26" style="filter:invert(1);flex-shrink:0" ')}<span>${esc(a)}</span>${i === highlight ? ' <span class="pill" style="margin-left:6px">Correct</span>' : ""}</div>
      <div style="flex:1"><div class="bar a${i}" data-w="${(counts[i] / total) * 100}" style="width:max(48px, ${(counts[i] / total) * 100}%)">${counts[i]}${highlight === undefined && counts[i] ? ` · ${Math.round((counts[i] / total) * 100)}%` : ""}</div></div>
    </div>`).join("");
}

function reveal(m) {
  stopTimer && stopTimer(); clearTimeout(question.hurry);
  $("#rNum").textContent = `Question ${m.index + 1}`;
  $("#rTitle").textContent = m.text;
  $("#bars").innerHTML = barsHtml(m.answers, m.counts, m.correct);
  document.querySelectorAll("#bars .bar").forEach((b) => (b.style.width = "0"));
  show("reveal");
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll("#bars .bar").forEach((b) => (b.style.width = `max(48px, ${b.dataset.w}%)`))));
}

function board(m) {
  $("#bNum").textContent = `After slide ${m.index + 1} of ${m.total}`;
  $("#board").innerHTML = m.top.length ? m.top.map((p, i) => `
    <div class="lb-row rise" style="animation-delay:${i * 80}ms">
      <span class="rank">${i + 1}</span><span class="dot" style="width:16px;height:16px;border-radius:99px;background:${p.color}"></span>
      <span>${esc(p.name)}</span>${p.streak > 1 ? `<span class="pill" style="background:var(--coral);font-size:15px">Streak ×${p.streak}</span>` : ""}
      <span class="score">${p.score}</span></div>`).join("") : '<p class="muted">No players yet.</p>';
  $("#nextBtn").textContent = m.last ? "Show podium" : "Next";
  show("board");
}

function podium(m) {
  lastResults = m.results || [];
  const order = [1, 0, 2], heights = ["260px", "190px", "140px"], colors = ["#FFB627", "#19D3C5", "#FF5D73"];
  $("#podium").innerHTML = order.filter((i) => m.top[i]).map((i) => `
    <div class="pod rise" style="animation-delay:${[600, 1200, 0][i]}ms">
      <p class="who">${esc(m.top[i].name)}</p><p style="font-family:var(--display);font-weight:800;font-size:22px">${m.top[i].score}</p>
      <div class="block" style="height:${heights[i]};background:${colors[i]}">${i + 1}</div>
    </div>`).join("");
  show("podium");
  setTimeout(() => confetti(160), 1300);
}

function finished(m) {
  $("#finMinni").innerHTML = minni("happy", 150);
  $("#finText").textContent = `${m.players} ${m.players === 1 ? "person" : "people"} took part. Download the results to keep everyone's input.`;
  show("finished");
  confetti(100);
}

// ----- interaction slides (Kalakal Kural) -----
const HINTS = {
  poll: "Vote on your phone. You can change your vote.",
  wordcloud: "Send up to 3 words from your phone.",
  open: "Answer on your phone. Answers appear here anonymously.",
  scale: "Rate each statement from 1 to 5 on your phone.",
  qa: "Ask a question on your phone and upvote the ones you like.",
};

function engageStart(m) {
  stopTimer && stopTimer(); clearTimeout(question.hurry);
  engage = { index: m.index, total: m.total, slide: m.slide, results: m.results };
  $("#eNum").textContent = `Slide ${m.index + 1} of ${m.total}`;
  $("#eType").textContent = TYPE_LABEL[m.slide.type];
  $("#eTitle").textContent = m.slide.text;
  $("#eHint").textContent = HINTS[m.slide.type];
  $("#eNext").textContent = m.index + 1 >= m.total ? "Finish" : "Next";
  renderResults();
  show("engage");
}

function setCount() {
  const r = engage.results || {};
  const n = r.responses || 0;
  $("#eCount").textContent = engage.slide.type === "qa"
    ? `${(r.items || []).filter((x) => !x.hidden).length} questions · ${players.length} people`
    : `${n} of ${players.length} responded`;
}

function renderResults() {
  const { slide, results: r } = engage;
  setCount();
  const body = $("#eBody");
  if (slide.type === "poll") {
    body.innerHTML = `<div class="stack" style="justify-content:center;max-width:1000px;margin:0 auto;height:100%">${barsHtml(slide.answers, r.counts)}</div>`;
  } else if (slide.type === "wordcloud") {
    if (!r.words.length) { body.innerHTML = waiting(); return; }
    const max = r.words[0].count, colors = ["#FFB627", "#19D3C5", "#FF5D73", "#A78BFA", "#FFF8EC"];
    // biggest words in the middle
    const sorted = r.words.slice(), arranged = [];
    sorted.forEach((w, i) => (i % 2 ? arranged.push(w) : arranged.unshift(w)));
    body.innerHTML = `<div class="cloud">${arranged.map((w, i) => {
      const size = 22 + Math.round((w.count / max) * 74);
      return `<span style="font-size:${size}px;color:${colors[i % colors.length]}" title="${w.count}">${esc(w.text)}</span>`;
    }).join("")}</div>`;
  } else if (slide.type === "open") {
    const shown = r.items.filter((x) => !x.hidden), hidden = r.items.filter((x) => x.hidden);
    body.innerHTML = (shown.length ? `<div class="wall">${shown.slice().reverse().map((x) => `
      <div class="note"><span>${esc(x.text)}</span><div class="tools"><button class="mini" type="button" data-hide="${x.id}">Hide</button></div></div>`).join("")}</div>` : waiting())
      + hiddenList(hidden);
  } else if (slide.type === "scale") {
    body.innerHTML = `<div class="stack" style="gap:34px;max-width:1000px;margin:0 auto;padding-top:10px">${slide.statements.map((st, k) => {
      const avg = r.averages[k];
      const left = avg ? ((avg - 1) / 4) * 100 : 0;
      return `<div class="scale-row"><p style="font-weight:800;font-size:24px">${esc(st)}</p>
        <div class="scale-track">${avg ? `<div class="scale-dot" style="left:${left}%">${avg.toFixed(1)}</div>` : ""}</div>
        <div class="row" style="justify-content:space-between;font-size:16px" ><span class="muted">1 · ${esc(slide.low)}</span><span class="muted">${r.dist[k].map((c, v) => `${v + 1}: ${c}`).join(" · ")}</span><span class="muted">${esc(slide.high)} · 5</span></div></div>`;
    }).join("")}</div>`;
  } else if (slide.type === "qa") {
    const shown = r.items.filter((x) => !x.hidden), hidden = r.items.filter((x) => x.hidden);
    body.innerHTML = (shown.length ? `<div class="stack" style="max-width:1000px;margin:0 auto">${shown.map((x) => `
      <div class="qa-row ${x.answered ? "done" : ""}"><span class="votes">${x.votes}</span><span class="grow" style="font-size:22px;font-weight:700">${esc(x.text)}</span>
        <button class="mini" type="button" data-answered="${x.id}">${x.answered ? "Reopen" : "Answered"}</button><button class="mini" type="button" data-hide="${x.id}">Hide</button></div>`).join("")}</div>` : waiting())
      + hiddenList(hidden);
  }
}

function waiting() {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;height:100%;min-height:220px"><div class="float">${minni("ready", 110)}</div><p class="muted">Waiting for the first answers…</p></div>`;
}
function hiddenList(hidden) {
  if (!hidden.length) return "";
  return `<details style="max-width:1000px;margin:16px auto 0"><summary>Hidden (${hidden.length})</summary><div class="stack" style="padding-top:8px">${hidden.map((x) => `
    <div class="row" style="justify-content:space-between;background:var(--night);border-radius:12px;padding:8px 14px"><span class="muted">${esc(x.text)}</span><button class="mini" type="button" data-hide="${x.id}">Show again</button></div>`).join("")}</div></details>`;
}
$("#eBody").addEventListener("click", (e) => {
  const h = e.target.closest("[data-hide]"), a = e.target.closest("[data-answered]");
  if (h) conn.send({ t: "hide", id: Number(h.dataset.hide) });
  if (a) conn.send({ t: "answered", id: Number(a.dataset.answered) });
});

// ----- results download -----
function downloadCsv() {
  const rows = [["Kalakal results", `PIN ${pin}`], []];
  if (lastResults.length) {
    rows.push(["Quiz ranking"], ["Rank", "Nickname", "Score"], ...lastResults.map((r) => [r.rank, r.name, r.score]), []);
  }
  lastSummary.forEach((s, i) => {
    if (s.type === "quiz" || !s.results) return;
    rows.push([`Slide ${i + 1} (${TYPE_LABEL[s.type]})`, s.text]);
    const r = s.results;
    if (s.type === "poll") { rows.push(["Option", "Votes"]); s.answers.forEach((a, k) => rows.push([a, r.counts[k]])); }
    if (s.type === "scale") { rows.push(["Statement", "Average", "1", "2", "3", "4", "5"]); s.statements.forEach((st, k) => rows.push([st, r.averages[k] ?? "", ...r.dist[k]])); }
    if (s.type === "wordcloud") { rows.push(["Word", "Count"]); r.words.forEach((w) => rows.push([w.text, w.count])); }
    if (s.type === "open") { rows.push(["Answer", "Hidden"]); r.items.forEach((x) => rows.push([x.text, x.hidden ? "yes" : ""])); }
    if (s.type === "qa") { rows.push(["Question", "Upvotes", "Answered", "Hidden"]); r.items.forEach((x) => rows.push([x.text, x.votes, x.answered ? "yes" : "", x.hidden ? "yes" : ""])); }
    rows.push([]);
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `kalakal-${pin}-results.csv`; a.click();
}
$("#csvBtn").addEventListener("click", downloadCsv);
$("#finCsv").addEventListener("click", downloadCsv);

function message(title, text, mood, withNext = false) {
  $("#msgMinni").innerHTML = minni(mood, 130);
  $("#msgTitle").textContent = title; $("#msgText").textContent = text;
  $("#msgNext").hidden = !withNext;
  show("message");
}

if (pin) openGame(); else show("setup");
