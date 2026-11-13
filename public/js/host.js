import { SHAPES, SHAPE_NAMES, esc, $, show, connect, startTimer, confetti } from "/js/common.js";
import { DEMO_QUIZ, DEMO_MEETING, SLIDE_TYPES, TYPE_LABEL, blankSlide } from "/js/quizzes.js";
import { avatarSvg } from "/js/avatar.js";
import { parseQuick, parseSpreadsheetFile, toCSV, TEMPLATE_CSV, aiPrompt, mediaFromLink } from "/js/quicktype.js";
import { compressImage, ytThumb, mediaHtml, parseTime, fmtTime } from "/js/media.js";
import { initAi } from "/js/ai-ui.js";

const params = new URLSearchParams(location.search);
let pin = (params.get("pin") || "").replace(/\D/g, "");
let conn = null;
let players = [];
let locked = false;
let stopTimer = null;
let lastResults = [];   // quiz ranking
let lastSummary = [];   // per-slide results
let engage = null;      // current interaction slide { index, total, slide }
let funNamesOn = false;
let builderMode = "play";

$("#demoTitle").textContent = `${DEMO_QUIZ.title}: Sweden, Tamil culture and general knowledge.`;
$("#meetTitle").textContent = "Word cloud, poll, team-health scale, open ideas and live Q&A.";
const M = (name, w, alt = "") => `<img class="mascot" src="/img/mascots/${name}.webp" alt="${alt}" width="${w}" style="height:auto">`;
["host-thinking","host-surprised","host-happy","explorer-thinking"].forEach((n) => { new Image().src = `/img/mascots/${n}.webp`; });
$("#qMinni").innerHTML = M("host-thinking", 130);

// ---------- setup ----------
$("#playDemo").addEventListener("click", () => createGame(DEMO_QUIZ, $("#setupErr")));
$("#playMeeting").addEventListener("click", () => createGame(DEMO_MEETING, $("#setupErr")));
$("#buildPlay").addEventListener("click", () => openBuilder("play"));
$("#buildKural").addEventListener("click", () => openBuilder("kural"));
$("#backToSetup").addEventListener("click", () => {
  if (editingPin) { editingPin = null; show("lobby"); } else show("setup");
});

// One draft per mode, kept in this browser
if (localStorage.getItem("kalakal:draft") && !localStorage.getItem("kalakal:draft:play")) localStorage.setItem("kalakal:draft:play", localStorage.getItem("kalakal:draft"));
let draft = null;
let editingPin = null;     // set while editing a live game's questions from the lobby
let currentQuiz = null;    // the quiz the server has for this game
let pendingMedia = null;
const draftKey = () => (editingPin ? "kalakal:draft:game:" + editingPin : "kalakal:draft:" + builderMode);
function saveDraft() {
  try { localStorage.setItem(draftKey(), JSON.stringify(draft)); $("#draftNote").textContent = "Draft saved in this browser"; }
  catch { $("#draftNote").textContent = "Too big to save in this browser: use picture links instead of uploads for some questions."; }
}
// Older drafts stored one correct answer as a number
function tidy(q) {
  if (q.type === "quiz") {
    if (!Array.isArray(q.correct)) q.correct = [Number(q.correct) || 0];
    if (q.points === undefined) q.points = 1;
    if (!q.tf) while (q.answers.length < 4) q.answers.push("");
  }
  return q;
}

// A game's quiz (as the server keeps it) back into editor form
function quizToDraft(quiz, media = []) {
  return {
    title: quiz.title || "",
    questions: quiz.questions.map((q, i) => {
      if (q.type === "quiz") {
        const tf = q.answers.length === 2 && /^true$/i.test(q.answers[0]) && /^false$/i.test(q.answers[1]);
        const out = { type: "quiz", text: q.text, answers: tf ? q.answers.slice() : [...q.answers, "", "", ""].slice(0, 4), correct: (Array.isArray(q.correct) ? q.correct : [q.correct]).slice(), time: q.time || 20, points: q.points ?? 1 };
        if (tf) out.tf = true;
        if (media[i]) out.media = media[i];
        return out;
      }
      if (q.type === "poll") return { type: "poll", text: q.text, answers: [...q.answers, "", "", ""].slice(0, 4) };
      if (q.type === "scale") return { type: "scale", text: q.text, statements: q.statements.slice(), low: q.low, high: q.high };
      return { type: q.type, text: q.text };
    }),
  };
}

function openBuilder(mode, preset = null) {
  builderMode = mode;
  draft = preset || JSON.parse(localStorage.getItem(draftKey()) || "null") || { title: "", questions: [blankSlide(mode === "play" ? "quiz" : "poll")] };
  if (preset) saveDraft();
  $("#liveEdit").hidden = !editingPin;
  $("#liveEdit").textContent = editingPin ? `Editing the live game · PIN ${editingPin.replace(/(\d{3})(\d{3})/, "$1 $2")}. Players stay in the lobby. Press Save when you're done.` : "";
  $("#playCustom").textContent = editingPin ? "Save and back to lobby" : "Create game";
  $("#backToSetup").textContent = editingPin ? "Back to lobby" : "Back";
  draft.questions.forEach((q) => { if (!q.type) q.type = "quiz"; tidy(q); });
  $("#builderMode").textContent = mode === "play" ? "Kalakal Play · Quiz game" : "Kalakal Pulse · Live polls & feedback";
  $("#builderMode").className = "mode-chip " + (mode === "kural" ? "kural" : "");
  $("#builderHint").textContent = mode === "play" ? "Players score points for right, fast answers." : "No scores: answers show live and anonymously.";
  $("#quizTitle").placeholder = mode === "play" ? "Friday team quiz" : "Monday team check-in";
  $("#openAi").hidden = mode !== "play";
  const group = (m, label) => `<div class="stack" style="gap:10px"><p class="muted" style="font-weight:700">${label}</p><div class="type-picker">${SLIDE_TYPES.filter((t) => t.mode === m).map((t) => `<button class="type-btn" type="button" data-type="${t.type}"><strong>${t.label}</strong><span>${t.hint}</span></button>`).join("")}</div></div>`;
  $("#typePicker").innerHTML = mode === "play"
    ? group("play", "Quiz games") + group("kural", "Mix in a poll or feedback slide (optional)")
    : group("kural", "Live polls & feedback") + group("play", "Mix in a scored quiz question (optional)");
  renderEditor(); show("editor");
}
$("#typePicker").addEventListener("click", (e) => {
  const b = e.target.closest("[data-type]"); if (!b) return;
  draft.questions.push(blankSlide(b.dataset.type)); saveDraft(); renderEditor();
  const inputs = document.querySelectorAll('#qList [data-f="text"]'); inputs[inputs.length - 1].focus();
});

const TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="#160B2A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function mediaEditor(q, qi) {
  const m = q.media;
  if (!m) return `<div class="q-media-edit">
      <button class="btn btn-ghost btn-sm" type="button" data-f="upload">Add picture</button>
      <input type="text" data-f="link" placeholder="…or paste a picture, GIF or YouTube link" aria-label="Slide ${qi + 1} picture or YouTube link">
    </div><p class="q-tip">Tip: you can also drag a picture onto this card, or paste one with Ctrl/Cmd+V.</p>`;
  if (m.kind === "image") return `<div class="q-media-prev"><img src="${esc(m.src)}" alt="Picture for slide ${qi + 1}"><span class="muted">Picture shows on the big screen.</span><button class="icon-btn" type="button" data-f="unmedia">Remove picture</button></div>`;
  return `<div class="q-media-prev"><img src="${ytThumb(m)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="stack" style="gap: 6px"><span style="font-weight: 800">YouTube video</span>
        <div class="yt-times"><label class="muted" for="ys${qi}">Start</label><input id="ys${qi}" type="text" data-f="ytstart" placeholder="0:00" value="${fmtTime(m.start)}"><label class="muted" for="ye${qi}">End</label><input id="ye${qi}" type="text" data-f="ytend" placeholder="end" value="${fmtTime(m.end)}"></div></div>
      <button class="icon-btn" type="button" data-f="unmedia">Remove video</button></div>`;
}

function slideFields(q, qi) {
  const n = qi + 1;
  if (q.type === "quiz") {
    const count = q.tf ? 2 : 4, several = q.correct.length > 1;
    return `${mediaEditor(q, qi)}
      <div class="q-answers">${q.answers.slice(0, count).map((a, ai) => {
        const on = q.correct.includes(ai);
        return `<div class="q-ans a${ai}${on ? " is-right" : ""}">${SHAPES[ai]}
        <input type="text" data-f="ans" data-a="${ai}" maxlength="80" placeholder="Answer ${ai + 1}${ai > 1 ? " (optional)" : ""}" value="${esc(a)}" aria-label="Slide ${n}, answer ${ai + 1} (${SHAPE_NAMES[ai]})">
        <button class="mark" type="button" data-f="mark" data-a="${ai}" aria-pressed="${on}" aria-label="Slide ${n}, answer ${ai + 1} is right"><span class="tick">${TICK}</span>Right</button>
      </div>`; }).join("")}</div>
      <p class="q-tip">${several ? `${q.correct.length} right answers: any of them scores.` : "Tap Right on the correct answer. Mark more than one if several are right."} Press Enter to jump to the next box.</p>`;
  }
  if (q.type === "poll") {
    return `<div class="q-answers">${q.answers.map((a, ai) => `
      <div class="q-ans a${ai}">${SHAPES[ai]}
        <input type="text" data-f="ans" data-a="${ai}" maxlength="80" placeholder="Option ${ai + 1}${ai > 1 ? " (optional)" : ""}" value="${esc(a)}" aria-label="Slide ${n}, option ${ai + 1} (${SHAPE_NAMES[ai]})">
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
      <div class="q-head"><div class="row"><p class="eyebrow">Slide ${qi + 1}</p><span class="type-tag">${q.tf ? "True or false" : TYPE_LABEL[q.type]}</span></div>
        <div class="row">${q.type === "quiz" ? `<label class="muted" for="t${qi}" style="font-weight:600">Time</label>
          <select id="t${qi}" data-f="time">${[10, 15, 20, 30, 45, 60].map((s) => `<option value="${s}" ${s === q.time ? "selected" : ""}>${s} s</option>`).join("")}</select>
          <label class="muted" for="p${qi}" style="font-weight:600">Points</label>
          <select id="p${qi}" data-f="points">${[[1, "Normal"], [2, "Double"], [0, "No points"]].map(([v, l]) => `<option value="${v}" ${v === q.points ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
          <button class="icon-btn" type="button" data-f="dup" aria-label="Duplicate slide ${qi + 1}">Duplicate</button>
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
  if (f === "points") q.points = Number(e.target.value);
  if (f === "ytstart" || f === "ytend") { q.media[f === "ytstart" ? "start" : "end"] = parseTime(e.target.value); }
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
  const btn = e.target.closest("[data-f]"); if (!btn) return;
  const f = btn.dataset.f, card = btn.closest("[data-q]"); if (!card) return;
  const i = Number(card.dataset.q), q = draft.questions[i];
  if (f === "mark") {
    const a = Number(btn.dataset.a), at = q.correct.indexOf(a);
    if (at >= 0) { if (q.correct.length > 1) q.correct.splice(at, 1); } else q.correct.push(a);
    q.correct.sort();
  } else if (f === "remove") { draft.questions.splice(i, 1); if (!draft.questions.length) draft.questions.push(blankSlide(builderMode === "play" ? "quiz" : "poll")); }
  else if (f === "up") [draft.questions[i - 1], draft.questions[i]] = [draft.questions[i], draft.questions[i - 1]];
  else if (f === "dup") draft.questions.splice(i + 1, 0, JSON.parse(JSON.stringify(q)));
  else if (f === "unmedia") delete q.media;
  else if (f === "upload") { pickPicture(i); return; }
  else return;
  saveDraft(); renderEditor();
});

// Paste a picture/YouTube link
$("#qList").addEventListener("change", (e) => {
  if (e.target.dataset.f !== "link") return;
  const i = Number(e.target.closest("[data-q]").dataset.q), m = mediaFromLink(e.target.value);
  if (!m) { e.target.value = ""; e.target.placeholder = "That doesn't look like a picture or YouTube link"; return; }
  draft.questions[i].media = m; saveDraft(); renderEditor();
});

async function addPicture(i, file) {
  try { draft.questions[i].media = { kind: "image", src: await compressImage(file) }; saveDraft(); renderEditor(); }
  catch (err) { $("#editErr").textContent = err.message; $("#editErr").hidden = false; }
}
function pickPicture(i) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
  inp.onchange = () => inp.files[0] && addPicture(i, inp.files[0]); inp.click();
}
// Drag a picture onto a quiz card, or paste one while typing in it
$("#qList").addEventListener("dragover", (e) => { const c = e.target.closest(".q-card"); if (c && draft.questions[c.dataset.q].type === "quiz") { e.preventDefault(); c.classList.add("drop"); } });
$("#qList").addEventListener("dragleave", (e) => { const c = e.target.closest(".q-card"); c && c.classList.remove("drop"); });
$("#qList").addEventListener("drop", (e) => {
  const c = e.target.closest(".q-card"); if (!c) return; e.preventDefault(); c.classList.remove("drop");
  const file = [...(e.dataTransfer.files || [])].find((f) => f.type.startsWith("image/"));
  if (file) return addPicture(Number(c.dataset.q), file);
  const m = mediaFromLink(e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"));
  if (m) { draft.questions[c.dataset.q].media = m; saveDraft(); renderEditor(); }
});
$("#qList").addEventListener("paste", (e) => {
  const c = e.target.closest(".q-card"); if (!c || draft.questions[c.dataset.q].type !== "quiz") return;
  const file = [...(e.clipboardData.items || [])].map((it) => it.kind === "file" && it.getAsFile()).find((f) => f && f.type.startsWith("image/"));
  if (file) { e.preventDefault(); addPicture(Number(c.dataset.q), file); }
});

// Enter moves to the next box; on the last answer of the last slide it adds a new slide
$("#qList").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
  const el = e.target; if (!el.matches('input[type="text"]') || el.dataset.f === "link") return;
  e.preventDefault();
  const card = el.closest("[data-q]"), boxes = [...card.querySelectorAll('input[data-f="text"], input[data-f="ans"], input[data-f="stmt"]')];
  const at = boxes.indexOf(el);
  if (at >= 0 && at < boxes.length - 1) return boxes[at + 1].focus();
  const next = card.nextElementSibling;
  if (next) return next.querySelector('input[data-f="text"]').focus();
  const cur = draft.questions[Number(card.dataset.q)];
  draft.questions.push(cur.type === "quiz" ? { ...blankSlide(cur.tf ? "truefalse" : "quiz"), time: cur.time, points: 1 } : blankSlide(cur.type));
  saveDraft(); renderEditor();
  const inputs = document.querySelectorAll('#qList [data-f="text"]'); inputs[inputs.length - 1].focus();
});

// ---------- paste / type questions ----------
const dlg = $("#pasteDlg");
$("#openPaste").addEventListener("click", () => { $("#pasteErr").hidden = true; dlg.showModal(); $("#pasteText").focus(); previewPaste(); });
$("#pasteClose").addEventListener("click", () => dlg.close());
function previewPaste() {
  const { slides, errors } = parseQuick($("#pasteText").value);
  $("#pasteCount").textContent = slides.length ? `${slides.length} question${slides.length > 1 ? "s" : ""} ready` : "Preview";
  $("#pastePrev").innerHTML = slides.length ? slides.map((q, i) => `<div class="pp-q"><p>${i + 1}. ${esc(q.text)}${q.type === "poll" ? ' <span class="muted">(poll)</span>' : ""}${q.points === 2 ? ' <span class="muted">· double</span>' : ""}${q.media ? ' <span class="muted">· ' + (q.media.kind === "youtube" ? "video" : "picture") + "</span>" : ""}</p><ul>${q.answers.filter(Boolean).map((a, ai) => `<li class="${q.type === "quiz" && q.correct.includes(ai) ? "r" : ""}">${q.type === "quiz" && q.correct.includes(ai) ? "✓ " : "· "}${esc(a)}</li>`).join("")}</ul></div>`).join("")
    : '<p class="muted">Your questions will appear here as you type.</p>';
  const err = $("#pasteErr"); err.hidden = !errors.length; err.textContent = errors.slice(0, 4).join(" · ") + (errors.length > 4 ? ` · and ${errors.length - 4} more` : "");
  return slides;
}
$("#pasteText").addEventListener("input", previewPaste);
function addSlides(slides, replace) {
  const keep = replace ? [] : draft.questions.filter((q) => (q.text || "").trim() || (q.answers || []).some((a) => a.trim()));
  draft.questions = keep.concat(slides.map(tidy)).slice(0, 50);
  saveDraft(); renderEditor();
}
initAi({
  add: (slides) => { addSlides(slides, false); $("#draftNote").textContent = `Added ${slides.length} AI questions. Check them before you play.`; },
  title: () => draft.title.trim(),
  fallback: () => { $("#openPaste").click(); $("#copyPrompt").click(); },
});
for (const [id, replace] of [["pasteAdd", false], ["pasteReplace", true]]) {
  $("#" + id).addEventListener("click", () => {
    const slides = previewPaste();
    if (!slides.length) { $("#pasteErr").textContent = "Nothing to add yet. Type a question, then its answers on the next lines."; $("#pasteErr").hidden = false; return; }
    if (replace && !confirm(`Replace all ${draft.questions.length} slides with ${slides.length} new ones?`)) return;
    addSlides(slides, replace); dlg.close(); $("#pasteText").value = "";
  });
}
$("#copyPrompt").addEventListener("click", async () => {
  const b = $("#copyPrompt");
  try { await navigator.clipboard.writeText(aiPrompt(draft.title.trim() || "[your topic]")); b.textContent = "Copied! Paste it into your AI, then paste the reply here"; }
  catch { $("#pasteText").value = aiPrompt(); previewPaste(); b.textContent = "Prompt placed in the box: copy it from there"; }
  setTimeout(() => (b.textContent = "Copy AI prompt (ChatGPT, Claude, Gemini)"), 5000);
});

// ---------- spreadsheet ----------
const download = (name, text, type = "text/csv;charset=utf-8") => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
$("#templateBtn").addEventListener("click", () => download("kalakal-quiz-template.csv", TEMPLATE_CSV));
$("#exportBtn").addEventListener("click", () => download(`${(draft.title.trim() || "kalakal-quiz").replace(/[^\w-]+/g, "-").toLowerCase()}.csv`, toCSV(draft.questions)));
$("#importBtn").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  const err = $("#importErr"); err.hidden = true;
  if (/\.xlsx?$/i.test(file.name)) { err.textContent = "Save the sheet as CSV first (File → Download → CSV), or copy the rows and use Paste."; err.hidden = false; return; }
  const { slides, errors } = parseSpreadsheetFile(await file.text());
  if (slides.length) addSlides(slides, false);
  if (errors.length || !slides.length) { err.textContent = (slides.length ? `Added ${slides.length}. Skipped: ` : "Nothing imported. ") + errors.slice(0, 4).join(" · "); err.hidden = false; }
});

$("#playCustom").addEventListener("click", () => {
  const err = $("#editErr"); err.hidden = true;
  const out = [], media = [];
  for (const [i, q] of draft.questions.entries()) {
    const n = i + 1, text = (q.text || "").trim();
    const blank = !text && (q.answers || []).every((a) => !a.trim()) && (q.statements || []).every((s) => !s.trim());
    if (blank) continue;
    if (!text) return fail(`Slide ${n} needs a question.`);
    if (q.type === "quiz" || q.type === "poll") {
      const filled = q.answers.map((a, ai) => ({ a: a.trim(), ai })).filter((x) => x.a);
      if (filled.length < 2) return fail(`Slide ${n} needs at least 2 ${q.type === "poll" ? "options" : "answers"}.`);
      if (q.type === "quiz") {
        const correct = filled.map((x, xi) => (q.correct.includes(x.ai) ? xi : -1)).filter((x) => x >= 0);
        if (!correct.length) return fail(`Slide ${n}: tap Right on the correct answer (the one marked is empty).`);
        media[out.length] = q.media || null;
        out.push({ type: "quiz", text, answers: filled.map((x) => x.a), correct, time: q.time, points: q.points ?? 1 });
      } else out.push({ type: "poll", text, answers: filled.map((x) => x.a) });
    } else if (q.type === "scale") {
      const statements = q.statements.map((s) => s.trim()).filter(Boolean);
      if (!statements.length) return fail(`Slide ${n} needs at least one statement to rate.`);
      out.push({ type: "scale", text, statements, low: q.low, high: q.high });
    } else out.push({ type: q.type, text });
  }
  if (!out.length) return fail("Add at least one slide.");
  const quiz = { title: draft.title.trim() || (builderMode === "play" ? "My Kalakal quiz" : "My Kalakal session"), questions: out };
  if (editingPin) { pendingMedia = media; $("#playCustom").disabled = true; conn.send({ t: "update_quiz", quiz }); return; }
  createGame(quiz, err, media);
  function fail(t) { err.textContent = t; err.hidden = false; }
});

// Pictures and videos stay in this browser tab (the big screen); phones only get the answers
let mediaList = [];
async function createGame(quiz, errEl, media = []) {
  errEl.hidden = true;
  try {
    const res = await fetch("/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quiz }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not create the game");
    localStorage.setItem("kalakal:host:" + data.pin, data.hostKey);
    pin = data.pin;
    mediaList = media; currentQuiz = quiz;
    try { sessionStorage.setItem("kalakal:media:" + pin, JSON.stringify(media)); } catch { /* too big to keep across a refresh */ }
    history.replaceState(null, "", "/host.html?pin=" + pin);
    openGame();
  } catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
}

// Edit the questions of a game that is waiting in the lobby
$("#editQuizBtn").addEventListener("click", () => {
  if (!currentQuiz) return;
  editingPin = pin; $("#editErr").hidden = true;
  openBuilder(currentQuiz.questions.some((q) => q.type === "quiz") ? "play" : "kural", quizToDraft(currentQuiz, mediaList));
  window.scrollTo(0, 0);
});
// Start from a ready-made quiz and change it
function editReady(quiz, mode) {
  try {
    const cur = JSON.parse(localStorage.getItem("kalakal:draft:" + mode) || "null");
    if (cur && cur.questions.some((q) => (q.text || "").trim()) && !confirm("Replace the draft you're working on with this ready-made quiz?")) return;
  } catch { /* no draft */ }
  editingPin = null; openBuilder(mode, quizToDraft(quiz));
}
$("#editDemo").addEventListener("click", () => editReady(DEMO_QUIZ, "play"));
$("#editMeeting").addEventListener("click", () => editReady(DEMO_MEETING, "kural"));

// ---------- invite links ----------
function invite() {
  const url = `${location.origin}/play.html?pin=${pin}`;
  const kind = currentQuiz && !currentQuiz.questions.some((q) => q.type === "quiz") ? "session" : "quiz";
  const title = currentQuiz && currentQuiz.title ? ` “${currentQuiz.title}”` : "";
  return { url, text: `Join my Kalakal ${kind}${title}! Tap the link to join (game PIN ${pin.replace(/(\d{3})(\d{3})/, "$1 $2")}):` };
}
function setupShare() {
  const { url, text } = invite();
  $("#shareLink").textContent = url.replace(/^https?:\/\//, "");
  $("#waBtn").href = "https://wa.me/?text=" + encodeURIComponent(`${text} ${url}`);
  $("#shareBtn").hidden = !navigator.share;
}
$("#shareBtn").addEventListener("click", () => { const { url, text } = invite(); navigator.share({ title: "Kalakal", text, url }).catch(() => {}); });
$("#copyLink").addEventListener("click", async () => {
  const { url, text } = invite(), b = $("#copyLink");
  try { await navigator.clipboard.writeText(`${text} ${url}`); b.textContent = "Copied!"; }
  catch { window.prompt("Copy this invite:", `${text} ${url}`); }
  setTimeout(() => (b.textContent = "Copy link"), 2500);
});

// ---------- live session ----------
function openGame() {
  const key = localStorage.getItem("kalakal:host:" + pin);
  if (!mediaList.length) try { mediaList = JSON.parse(sessionStorage.getItem("kalakal:media:" + pin) || "[]"); } catch { mediaList = []; }
  if (!key) { message("Not your game", "This browser didn't create game " + pin + ".", "sad"); return; }
  $("#bigPin").textContent = pin.replace(/(\d{3})(\d{3})/, "$1 $2");
  $("#joinHost").textContent = location.host;
  $("#eJoin").textContent = `Join at ${location.host} · PIN ${pin.replace(/(\d{3})(\d{3})/, "$1 $2")}`;
  const joinUrl = `${location.origin}/play.html?pin=${pin}`;
  try { const qr = qrcode(0, "M"); qr.addData(joinUrl); qr.make(); $("#qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { console.error(e); }
  setupShare();
  conn = connect(pin, "host", { onOpen: () => conn.send({ t: "host_hello", key }), onMessage });
}

function onMessage(m) {
  switch (m.t) {
    case "snapshot":
      $("#lobbyTitle").textContent = m.title; currentQuiz = m.quiz || currentQuiz; setupShare();
      players = m.players; locked = m.locked; funNamesOn = !!m.funNames; renderLobby();
      if (m.phase === "lobby") show("lobby");
      else if (m.phase === "question") question({ ...m.question, total: m.total, players: players.length });
      else if (m.phase === "engage") engageStart(m.engage);
      else if (m.phase === "podium" || m.phase === "finished") conn.send({ t: "end" });
      else message("Session in progress", "Continue to the next screen.", "ready", true);
      break;
    case "quiz_updated":
      currentQuiz = m.quiz; mediaList = pendingMedia || [];
      try { sessionStorage.setItem("kalakal:media:" + pin, JSON.stringify(mediaList)); } catch { /* too big */ }
      try { localStorage.removeItem("kalakal:draft:game:" + pin); } catch { /* ignore */ }
      editingPin = null; $("#playCustom").disabled = false;
      $("#lobbyTitle").textContent = m.quiz.title; setupShare(); show("lobby");
      break;
    case "update_error":
      $("#playCustom").disabled = false; $("#editErr").textContent = m.message; $("#editErr").hidden = false;
      break;
    case "lobby": players = m.players; locked = m.locked; funNamesOn = !!m.funNames; renderLobby(); if (engage) setCount(); break;
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
  $("#funBtn").textContent = `Fun names only: ${funNamesOn ? "on" : "off"}`;
  $("#funBtn").setAttribute("aria-pressed", String(funNamesOn));
  $("#kickHint").hidden = players.length === 0;
  $("#chips").innerHTML = players.length
    ? players.map((p) => `<button class="chip ${p.connected ? "" : "off"}" type="button" data-id="${esc(p.id)}" aria-label="Remove ${esc(p.name)}"><span class="avw">${avatarSvg(p.avatar, { size: 48 })}</span>${esc(p.name)}</button>`).join("")
    : '<p class="muted">Waiting for players to join…</p>';
}
$("#chips").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-id]"); if (!chip) return;
  const p = players.find((x) => x.id === chip.dataset.id);
  if (p && confirm(`Remove ${p.name} from the game?`)) conn.send({ t: "kick", id: p.id });
});
$("#lockBtn").addEventListener("click", () => conn.send({ t: "lock", locked: !locked }));
$("#funBtn").addEventListener("click", () => conn.send({ t: "fun_names", on: !funNamesOn }));
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
  const media = mediaList[m.index];
  $("#qMedia").hidden = !media; $("#qMedia").innerHTML = mediaHtml(media);
  $("#qMinni").innerHTML = M("host-thinking", media ? 96 : 130, "Host is thinking");
  $("#qX2").hidden = !(m.points === 2 || m.points === 0); $("#qX2").textContent = m.points === 2 ? "Double points" : "No points: warm-up";
  stopTimer && stopTimer();
  stopTimer = startTimer($("#timer"), m.time * 1000, m.remaining, null);
  clearTimeout(question.hurry);
  question.hurry = setTimeout(() => { $("#qMinni").innerHTML = M("host-surprised", media ? 96 : 130, "Hurry!"); }, Math.max(0, m.remaining - 5000));
  show("question");
}

function barsHtml(answers, counts, highlight) {
  const right = (i) => highlight !== undefined && (Array.isArray(highlight) ? highlight.includes(i) : i === highlight);
  const total = Math.max(1, counts.reduce((a, b) => a + b, 0));
  return answers.map((a, i) => `
    <div class="bar-row" style="${highlight === undefined || right(i) ? "" : "opacity:.45"}">
      <div style="flex: 0 0 34%; display:flex; align-items:center; gap:12px; font-weight:800; font-size:22px">${SHAPES[i].replace("<svg ", '<svg width="26" height="26" style="filter:invert(1);flex-shrink:0" ')}<span>${esc(a)}</span>${right(i) ? ' <span class="pill" style="margin-left:6px">Correct</span>' : ""}</div>
      <div style="flex:1"><div class="bar a${i}" data-w="${(counts[i] / total) * 100}" style="width:max(48px, ${(counts[i] / total) * 100}%)">${counts[i]}${highlight === undefined && counts[i] ? ` · ${Math.round((counts[i] / total) * 100)}%` : ""}</div></div>
    </div>`).join("");
}

function reveal(m) {
  stopTimer && stopTimer(); clearTimeout(question.hurry); $("#qMedia").innerHTML = "";
  $("#rNum").textContent = `Question ${m.index + 1}`;
  $("#rTitle").textContent = m.text;
  $("#bars").innerHTML = barsHtml(m.answers, m.counts, m.correct);
  document.querySelectorAll("#bars .bar").forEach((b) => (b.style.width = "0"));
  $("#rMascot").innerHTML = M("host-happy", 76, "");
  show("reveal");
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll("#bars .bar").forEach((b) => (b.style.width = `max(48px, ${b.dataset.w}%)`))));
}

function board(m) {
  $("#bNum").textContent = `After slide ${m.index + 1} of ${m.total}`;
  $("#board").innerHTML = m.top.length ? m.top.map((p, i) => `
    <div class="lb-row rise" style="animation-delay:${i * 80}ms">
      <span class="rank">${i + 1}</span><span class="avw ${p.streak >= 3 ? "react-fire" : i === 0 ? "react-idle" : ""}">${avatarSvg(p.avatar, { size: 56, mood: p.streak >= 3 ? "fire" : i === 0 ? "happy" : "ready" })}</span>
      <span>${esc(p.name)}</span>${p.streak > 1 ? `<span class="pill" style="background:var(--coral);font-size:15px">${p.streak >= 3 ? "On fire · " : "Streak "}×${p.streak}</span>` : ""}
      <span class="score">${p.score}</span></div>`).join("") : '<p class="muted">No players yet.</p>';
  $("#nextBtn").textContent = m.last ? "Show podium" : "Next";
  show("board");
  toasts(m.highlights || []);
}

const HL_TEXT = {
  lead: (h) => ["took the lead!", "New number one"], top3: (h) => ["jumped into the top 3!", "Climbing fast"],
  comeback: (h) => ["is making a comeback!", "Up 3+ places"],
};
function toasts(list) {
  const box = $("#toasts"); box.innerHTML = "";
  list.forEach((h, i) => {
    const [main, sub] = h.kind.startsWith("streak") ? [`is on fire!`, `${h.streak} right in a row`] : (HL_TEXT[h.kind] || (() => ["", ""]))(h);
    const el = document.createElement("div");
    el.className = "toast"; el.style.animationDelay = `${300 + i * 350}ms`;
    el.innerHTML = `<span class="avw ${h.kind.startsWith("streak") ? "react-fire" : "react-bounce"}">${avatarSvg(h.avatar, { size: 64, mood: h.kind.startsWith("streak") ? "fire" : "happy" })}</span><span>${esc(h.name)} ${main}<small>${sub}</small></span>`;
    box.appendChild(el);
  });
  clearTimeout(toasts.t); toasts.t = setTimeout(() => (box.innerHTML = ""), 7000);
}

function podium(m) {
  $("#toasts").innerHTML = "";
  lastResults = m.results || [];
  const order = [1, 0, 2], heights = ["220px", "160px", "120px"], colors = ["#FFB627", "#19D3C5", "#FF5D73"];
  $("#podium").innerHTML = order.filter((i) => m.top[i]).map((i) => `
    <div class="pod rise" style="animation-delay:${[600, 1200, 0][i]}ms">
      <span class="avw react-dance ${i === 0 ? "react-glow" : ""}" style="animation-delay:${i * 150}ms">${avatarSvg(m.top[i].avatar, { size: i === 0 ? 140 : 110, mood: "happy", label: m.top[i].name })}</span>
      <p class="who">${esc(m.top[i].name)}</p><p style="font-family:var(--display);font-weight:800;font-size:22px">${m.top[i].score}</p>
      <div class="block" style="height:${heights[i]};background:${colors[i]}">${i + 1}</div>
    </div>`).join("");
  show("podium");
  setTimeout(() => confetti(160), 1300);
}

function finished(m) {
  $("#finText").textContent = `${m.players} ${m.players === 1 ? "person" : "people"} took part. Download the results to keep everyone's input.`;
  show("finished");
  confetti(100);
}

// ----- interaction slides (Kalakal Pulse) -----
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
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;height:100%;min-height:220px"><div class="float">${M("explorer-thinking", 110, "")}</div><p class="muted">Waiting for the first answers…</p></div>`;
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
  $("#msgMinni").innerHTML = M(mood === "sad" ? "host-surprised" : "host-happy", 120, "");
  $("#msgTitle").textContent = title; $("#msgText").textContent = text;
  $("#msgNext").hidden = !withNext;
  show("message");
}

const build = params.get("build");
if (pin) openGame();
else if (build === "play" || build === "kural") { openBuilder(build); if (params.get("paste")) $("#openPaste").click(); else if (params.get("ai") && build === "play") $("#openAi").click(); }
else show("setup");
