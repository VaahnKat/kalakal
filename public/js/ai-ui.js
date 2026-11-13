// "Create with AI" window in the quiz builder.
// Talks to /api/ai/* (src/ai.js). Questions come back as normal slides, so they
// land in the editor exactly like pasted or imported ones.
import { esc, $ } from "/js/common.js";

const PREFS = "kalakal:ai";
const MAX_SOURCE = 12000;
let review = [];          // [{ slide, on }]
let lastOpts = null;
let hooks = { add: () => {}, title: () => "", fallback: () => {} };

const dlg = () => $("#aiDlg");
const step = (name) => { for (const id of ["aiForm", "aiBusy", "aiReview"]) $("#" + id).hidden = id !== name; };
const err = (el, text) => { el.textContent = text || ""; el.hidden = !text; };

export function initAi(h) {
  hooks = { ...hooks, ...h };
  $("#openAi").addEventListener("click", open);
  dlg().addEventListener("click", (e) => { if (e.target.closest('[data-ai="close"]')) dlg().close(); });
  $("#aiLang").addEventListener("change", () => { $("#aiLangOtherBox").hidden = $("#aiLang").value !== "other"; });
  $("#aiFileBtn").addEventListener("click", () => $("#aiFile").click());
  $("#aiFile").addEventListener("change", readFile);
  $("#aiGo").addEventListener("click", generate);
  $("#aiTopic").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); generate(); } });
  $("#aiBack").addEventListener("click", () => step("aiForm"));
  $("#aiAdd").addEventListener("click", addChosen);
  $("#aiPrompt").addEventListener("click", () => { dlg().close(); hooks.fallback(); });
  $("#aiList").addEventListener("click", onReviewClick);
  $("#aiList").addEventListener("change", (e) => {
    const card = e.target.closest("[data-i]"); if (!card || e.target.type !== "checkbox") return;
    review[card.dataset.i].on = e.target.checked; card.classList.toggle("off", !e.target.checked); countAdd();
  });
}

function open() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) || "{}");
    for (const [id, k] of [["aiCount", "count"], ["aiLevel", "level"], ["aiAudience", "audience"], ["aiTime", "time"]]) if (p[k]) $("#" + id).value = String(p[k]);
    if (p.language) {
      const known = [...$("#aiLang").options].some((o) => o.value === p.language);
      $("#aiLang").value = known ? p.language : "other"; $("#aiLangOther").value = known ? "" : p.language;
      $("#aiLangOtherBox").hidden = known;
    }
    $("#aiTF").checked = !!p.trueFalse;
  } catch { /* first time */ }
  if (!$("#aiTopic").value) $("#aiTopic").value = hooks.title();
  err($("#aiErr")); $("#aiPrompt").hidden = true;
  step(review.length ? "aiReview" : "aiForm");
  dlg().showModal();
  if (!review.length) $("#aiTopic").focus();
  refreshLeft();
}

async function refreshLeft(left) {
  try {
    const q = left || await fetch("/api/ai/quota").then((r) => r.json());
    $("#aiLeft").textContent = q.quizzes > 0 ? `Free · ${q.quizzes} left today` : "Free AI used up today";
  } catch { $("#aiLeft").textContent = ""; }
}

function options() {
  const language = $("#aiLang").value === "other" ? $("#aiLangOther").value.trim() : $("#aiLang").value;
  const o = {
    topic: $("#aiTopic").value.trim(), source: $("#aiSource").value.trim().slice(0, MAX_SOURCE),
    count: Number($("#aiCount").value), level: $("#aiLevel").value, audience: $("#aiAudience").value,
    language: language || "English", time: Number($("#aiTime").value), trueFalse: $("#aiTF").checked,
  };
  try { localStorage.setItem(PREFS, JSON.stringify({ ...o, topic: undefined, source: undefined })); } catch { /* ignore */ }
  return o;
}

async function call(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) { const e = new Error(data.error || "Something went wrong. Try again."); e.limit = !!data.limit; e.left = data; throw e; }
  return data;
}

async function generate() {
  const o = options();
  if (!o.topic && !o.source) { err($("#aiErr"), "Write a topic, or paste some notes for the AI to use."); $("#aiTopic").focus(); return; }
  err($("#aiErr")); $("#aiPrompt").hidden = true;
  $("#aiBusyTitle").textContent = `Writing ${o.count} questions${o.language !== "English" ? ` in ${o.language}` : ""}…`;
  step("aiBusy");
  try {
    const data = await call("/api/ai/quiz", o);
    lastOpts = o;
    review = data.slides.map((slide) => ({ slide, on: true }));
    renderReview(); step("aiReview"); refreshLeft(data);
    if (data.slides.length < o.count) err($("#aiReviewErr"), `The AI wrote ${data.slides.length} usable questions instead of ${o.count}.`);
    else err($("#aiReviewErr"));
  } catch (e) {
    step("aiForm"); err($("#aiErr"), e.message);
    $("#aiPrompt").hidden = false;
    if (e.left && "quizzes" in e.left) refreshLeft(e.left);
  }
}

function renderReview() {
  $("#aiList").innerHTML = review.map(({ slide: q, on }, i) => `
    <div class="ai-q${on ? "" : " off"}" data-i="${i}">
      <label class="ai-q-head"><input type="checkbox" ${on ? "checked" : ""} aria-label="Include question ${i + 1}"><p>${i + 1}. ${esc(q.text)}</p></label>
      <div class="ai-ans">${q.answers.map((a, ai) => `<span class="${q.correct.includes(ai) ? "r" : ""}">${q.correct.includes(ai) ? "✓ " : ""}${esc(a)}</span>`).join("")}</div>
      <div class="ai-tools">
        <button class="icon-btn" type="button" data-act="new">New question</button>
        <button class="icon-btn" type="button" data-act="harder">Harder</button>
        <button class="icon-btn" type="button" data-act="easier">Easier</button>
        ${q.tf ? "" : '<button class="icon-btn" type="button" data-act="distractors">Better wrong answers</button>'}
      </div>
    </div>`).join("");
  countAdd();
}

function countAdd() {
  const n = review.filter((r) => r.on).length;
  $("#aiAdd").textContent = n ? `Add ${n} question${n > 1 ? "s" : ""} to quiz` : "Add to quiz";
  $("#aiAdd").disabled = !n;
}

async function onReviewClick(e) {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const card = b.closest("[data-i]"), i = Number(card.dataset.i);
  card.classList.add("busy"); const label = b.textContent; b.textContent = "Rewriting…";
  err($("#aiReviewErr"));
  try {
    const data = await call("/api/ai/tweak", { ...lastOpts, action: b.dataset.act, slide: review[i].slide, avoid: review.map((r) => r.slide.text) });
    review[i] = { slide: data.slide, on: true };
    renderReview();
  } catch (ex) {
    b.textContent = label; card.classList.remove("busy");
    err($("#aiReviewErr"), ex.message);
  }
}

function addChosen() {
  const slides = review.filter((r) => r.on).map((r) => r.slide);
  if (!slides.length) return;
  hooks.add(slides);
  review = []; $("#aiList").innerHTML = "";
  dlg().close();
}

// ---------- notes from a file ----------
async function readFile(e) {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  const note = $("#aiFileNote");
  note.textContent = `Reading ${file.name}…`;
  try {
    let text = "";
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") text = await pdfText(file);
    else if (/^text\/|\.md$|\.txt$/i.test(file.type || file.name)) text = await file.text();
    else throw new Error("Use a PDF or a .txt file. For Word or PowerPoint, copy the text and paste it in.");
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text.length < 40) throw new Error("This file has no readable text (a scanned PDF?). Copy the text and paste it in instead.");
    $("#aiSource").value = text.slice(0, MAX_SOURCE);
    note.textContent = text.length > MAX_SOURCE ? `${file.name}: using the first ${MAX_SOURCE.toLocaleString()} characters` : `${file.name}: ${text.length.toLocaleString()} characters ready`;
    if (!$("#aiTopic").value.trim()) $("#aiTopic").value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  } catch (ex) { note.textContent = ex.message; }
}

async function pdfText(file) {
  const pdfjs = await import("/vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts = [];
  let size = 0;
  for (let p = 1; p <= Math.min(doc.numPages, 60) && size < MAX_SOURCE; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const t = content.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("");
    parts.push(t); size += t.length;
  }
  return parts.join("\n\n");
}
