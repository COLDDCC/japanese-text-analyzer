// Page wiring: language state, the tokenizer worker, and click handling.

import { LANGUAGES, loadLanguage, saveLanguage, t } from "./i18n.js";
import { lookupToken, prefetchShards } from "./lookup.js";
import { markSelected, renderDetails, renderTokens } from "./render.js";

const MAX_CHARS = 5000;
const SAMPLE = "今日はご飯を食べに行きました。昨日は行かなかったので、ラーメンが美味しかった。";

const dom = {
  input: document.getElementById("input"),
  analyze: document.getElementById("analyze"),
  clear: document.getElementById("clear"),
  sample: document.getElementById("sample"),
  charCount: document.getElementById("char-count"),
  status: document.getElementById("status"),
  progress: document.getElementById("progress"),
  progressBar: document.getElementById("progress-bar"),
  output: document.getElementById("output"),
  tokenCount: document.getElementById("token-count"),
  details: document.getElementById("details"),
  detailsBody: document.getElementById("details-body"),
  detailsClose: document.getElementById("details-close"),
};

let lang = loadLanguage();
let tokens = [];
let selectedIndex = null;
let dictReady = false;
let requestId = 0;
const pending = new Map();

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

worker.addEventListener("message", ({ data }) => {
  if (data.type === "progress") {
    // The last XHR's loadend can land after the tokenizer is already built.
    if (!dictReady) showProgress(data.percent);
    return;
  }
  if (data.type === "ready") {
    dictReady = true;
    hideProgress();
    setStatus(t(lang, "dictReady"));
    dom.analyze.disabled = false;
    return;
  }
  if (data.type === "tokens") {
    const resolve = pending.get(data.id);
    pending.delete(data.id);
    resolve?.(data.tokens);
    return;
  }
  if (data.type === "error") {
    pending.delete(data.id);
    hideProgress();
    setStatus(t(lang, "dictFailed"), true);
    dom.analyze.disabled = false;
    dom.analyze.textContent = t(lang, "analyze");
    console.error("tokenizer:", data.message);
  }
});

function tokenize(text) {
  const id = (requestId += 1);
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ type: "tokenize", id, text });
  });
}

function setStatus(message, isError = false) {
  dom.status.textContent = message ?? "";
  dom.status.classList.toggle("status--error", isError);
}

function showProgress(percent) {
  dom.progress.hidden = false;
  dom.progressBar.style.width = `${percent}%`;
  setStatus(t(lang, "loadingPercent", percent));
}

function hideProgress() {
  dom.progress.hidden = true;
}

function updateCharCount() {
  const length = dom.input.value.length;
  dom.charCount.textContent = t(lang, "charCount", length, MAX_CHARS);
  dom.charCount.classList.toggle("char-count--over", length > MAX_CHARS);
}

function applyLanguage() {
  document.documentElement.lang = lang === "zh" ? "zh" : "en";
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(lang, node.dataset.i18n);
  }
  for (const button of document.querySelectorAll(".lang-toggle__button")) {
    button.classList.toggle("is-active", button.dataset.lang === lang);
    button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  }
  dom.input.placeholder = t(lang, "placeholder");
  dom.detailsClose.setAttribute("aria-label", t(lang, "close"));
  updateCharCount();

  // Re-render anything already on screen in the new language.
  if (tokens.length) {
    renderTokens(dom.output, dom.input.value, tokens, lang);
    dom.tokenCount.textContent = t(lang, "tokenCount", countWords(tokens));
    if (selectedIndex != null) {
      markSelected(dom.output, selectedIndex);
      void showDetails(selectedIndex);
    }
  }
  if (dictReady) setStatus(t(lang, "dictReady"));
}

function countWords(list) {
  return list.filter((token) => token.pos !== "記号").length;
}

async function analyze() {
  const text = dom.input.value;
  if (!text.trim()) {
    setStatus(t(lang, "emptyInput"), true);
    return;
  }
  if (text.length > MAX_CHARS) {
    setStatus(t(lang, "tooLong", MAX_CHARS), true);
    return;
  }

  dom.analyze.disabled = true;
  dom.analyze.textContent = t(lang, "analyzing");
  if (!dictReady) setStatus(t(lang, "loadingDict"));

  try {
    tokens = await tokenize(text);
    selectedIndex = null;
    renderTokens(dom.output, text, tokens, lang);
    dom.tokenCount.textContent = t(lang, "tokenCount", countWords(tokens));
    dom.detailsBody.replaceChildren();
    dom.detailsBody.append(noteNode(t(lang, "detailsHint")));
    prefetchShards(tokens);
    setStatus("");
  } finally {
    dom.analyze.disabled = false;
    dom.analyze.textContent = t(lang, "analyze");
  }
}

function noteNode(text) {
  const p = document.createElement("p");
  p.className = "details__note";
  p.textContent = text;
  return p;
}

async function showDetails(index) {
  const token = tokens[index];
  if (!token) return;

  renderDetails(dom.detailsBody, token, null, lang);
  dom.details.classList.add("is-open");

  const result = await lookupToken(token).catch(() => ({ key: "", records: [] }));
  // A newer click may have landed while the shard was loading.
  if (selectedIndex === index) renderDetails(dom.detailsBody, token, result, lang);
}

dom.output.addEventListener("click", (event) => {
  const button = event.target.closest(".token");
  if (!button) return;
  selectedIndex = Number(button.dataset.index);
  markSelected(dom.output, selectedIndex);
  void showDetails(selectedIndex);
});

dom.analyze.addEventListener("click", () => void analyze());
dom.clear.addEventListener("click", () => {
  dom.input.value = "";
  tokens = [];
  selectedIndex = null;
  dom.output.replaceChildren();
  dom.tokenCount.textContent = "";
  dom.detailsBody.replaceChildren(noteNode(t(lang, "detailsHint")));
  dom.details.classList.remove("is-open");
  updateCharCount();
  setStatus("");
  dom.input.focus();
});
dom.sample.addEventListener("click", () => {
  dom.input.value = SAMPLE;
  updateCharCount();
  void analyze();
});
dom.detailsClose.addEventListener("click", () => dom.details.classList.remove("is-open"));
dom.input.addEventListener("input", updateCharCount);
dom.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void analyze();
});

for (const button of document.querySelectorAll(".lang-toggle__button")) {
  button.addEventListener("click", () => {
    if (!LANGUAGES.includes(button.dataset.lang)) return;
    lang = button.dataset.lang;
    saveLanguage(lang);
    applyLanguage();
  });
}

applyLanguage();
setStatus(t(lang, "loadingDict"));
dom.analyze.disabled = true;
worker.postMessage({ type: "init" });
