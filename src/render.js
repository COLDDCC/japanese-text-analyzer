// DOM building for the word stream and the details panel.

import { needsRuby, toHiragana } from "./kana.js";
import {
  conjugationLabel,
  isFunctionWord,
  isPunctuation,
  posLabel,
  posPath,
} from "./pos-map.js";
import { t } from "./i18n.js";

const MAX_ENTRIES_SHOWN = 3;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function tokenNode(token, index, lang) {
  const button = el("button", "token");
  button.type = "button";
  button.dataset.index = String(index);
  button.classList.add(isFunctionWord(token) ? "token--function" : "token--content");
  button.setAttribute("aria-label", `${token.surface_form} — ${posLabel(token, lang)}`);

  const reading = toHiragana(token.reading);
  if (needsRuby(token.surface_form, reading)) {
    const ruby = document.createElement("ruby");
    ruby.append(document.createTextNode(token.surface_form));
    const rt = el("rt", null, reading);
    ruby.append(rt);
    button.append(ruby);
  } else {
    button.textContent = token.surface_form;
  }
  return button;
}

/**
 * Renders the tokenized text. Characters kuromoji skips over (spaces, line
 * breaks) are copied back in from the original text so the layout survives.
 */
export function renderTokens(container, text, tokens, lang) {
  container.replaceChildren();
  let cursor = 0;

  tokens.forEach((token, index) => {
    const start = (token.word_position ?? cursor + 1) - 1;
    if (start > cursor) {
      container.append(document.createTextNode(text.slice(cursor, start)));
    }
    cursor = start + token.surface_form.length;

    if (isPunctuation(token)) {
      container.append(el("span", "punctuation", token.surface_form));
    } else {
      container.append(tokenNode(token, index, lang));
    }
  });

  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

export function markSelected(container, index) {
  for (const node of container.querySelectorAll(".token.is-selected")) {
    node.classList.remove("is-selected");
  }
  const selected = container.querySelector(`.token[data-index="${index}"]`);
  if (selected) selected.classList.add("is-selected");
}

/** One labelled cell of the details grid, in the reference's cell style. */
function cell(label, value, detail, japanese = false) {
  const wrapper = el("div", "cell");
  const dd = el("dd", japanese ? "jp" : null, value);
  if (detail) dd.append(el("span", "cell__detail", detail));
  wrapper.append(el("dt", null, label), dd);
  return wrapper;
}

function entryNode(record, lang, matchedKey) {
  const entry = el("div", "entry");
  const head = el("div", "entry__head");

  const writing = matchedKey ?? record.k ?? record.r[0];
  head.append(el("span", "entry__writing", writing));
  if (record.k && record.k !== writing) head.append(el("span", "entry__alt", record.k));

  const readings = record.r.filter((reading) => reading !== writing);
  if (readings.length) head.append(el("span", "entry__reading", readings.join("、")));
  if (record.c) head.append(el("span", "tag tag--common", t(lang, "common")));
  entry.append(head);

  if (record.p) entry.append(el("div", "entry__pos", record.p));

  const list = el("ol", "entry__glosses");
  for (const gloss of record.g) list.append(el("li", null, gloss));
  entry.append(list);
  return entry;
}

/** Fills the details panel for one token. `result` may be null while loading. */
export function renderDetails(panel, token, result, lang) {
  panel.replaceChildren();

  const header = el("div", "details__header");
  header.append(el("div", "details__surface", token.surface_form));
  const reading = toHiragana(token.reading);
  if (reading && reading !== token.surface_form) {
    header.append(el("div", "details__reading", reading));
  }
  panel.append(header);

  const cells = [];
  const base = token.basic_form && token.basic_form !== "*" ? token.basic_form : null;
  if (base && base !== token.surface_form) {
    cells.push(cell(t(lang, "baseForm"), `${token.surface_form} → ${base}`, null, true));
  }
  cells.push(cell(t(lang, "partOfSpeech"), posLabel(token, lang), posPath(token)));
  const conjugation = conjugationLabel(token, lang);
  if (conjugation) {
    const raw = token.conjugated_form;
    cells.push(cell(t(lang, "conjugation"), conjugation, raw === conjugation ? null : raw));
  }
  // An odd cell out spans the row, so no cell is left with a dangling border.
  if (cells.length % 2 === 1) cells.at(-1).classList.add("cell--wide");

  const facts = el("dl", "details__facts");
  facts.append(...cells);
  panel.append(facts);

  if (isFunctionWord(token)) {
    panel.append(el("p", "note", t(lang, "functionWord")));
    return;
  }

  if (!result) {
    panel.append(el("p", "note", "…"));
    return;
  }

  const meanings = el("section", "details__meanings");
  meanings.append(el("h3", "details__section-title", t(lang, "meanings")));
  if (!result.records.length) {
    meanings.append(el("p", "details__note details__note--empty", t(lang, "noEntry")));
  } else {
    for (const record of result.records.slice(0, MAX_ENTRIES_SHOWN)) {
      meanings.append(entryNode(record, lang, result.key));
    }
    const extra = t(lang, "dictEntries", result.records.length);
    if (extra) meanings.append(el("p", "details__more", extra));
  }
  panel.append(meanings);
}
