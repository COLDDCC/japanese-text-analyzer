// Tokenization runs here so a long paste never blocks the UI thread.
// kuromoji's dictionary is ~18 MB, so the first build takes a few seconds.

import kuromoji from "kuromoji";

const DICT_PATH = `${import.meta.env?.BASE_URL ?? "/"}dict/kuromoji`;
// base, check, tid, tid_pos, tid_map, cc, unk, unk_pos, unk_map, unk_char,
// unk_compat, unk_invoke — 12 gzipped files, loaded over XHR by kuromoji.
const DICT_FILE_COUNT = 12;

// Only the fields the UI actually uses; keeps postMessage payloads small.
const TOKEN_FIELDS = [
  "surface_form",
  "basic_form",
  "reading",
  "pos",
  "pos_detail_1",
  "pos_detail_2",
  "pos_detail_3",
  "conjugated_type",
  "conjugated_form",
  "word_position",
  "word_type",
];

let tokenizerPromise = null;

/**
 * kuromoji offers no load callback, so we count bytes on its XHRs instead.
 * The patch is scoped to the one build and reverted afterwards.
 */
function withProgress(onPercent, work) {
  const Native = self.XMLHttpRequest;
  const fractions = new Map();
  let lastReported = -1;

  const report = () => {
    let total = 0;
    for (const value of fractions.values()) total += value;
    const percent = Math.min(99, Math.round((total / DICT_FILE_COUNT) * 100));
    if (percent !== lastReported) {
      lastReported = percent;
      onPercent(percent);
    }
  };

  class TrackedRequest extends Native {
    constructor() {
      super();
      this.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          fractions.set(this, event.loaded / event.total);
          report();
        }
      });
      this.addEventListener("loadend", () => {
        fractions.set(this, 1);
        report();
      });
    }
  }

  self.XMLHttpRequest = TrackedRequest;
  const restore = () => {
    self.XMLHttpRequest = Native;
  };
  return work().then(
    (value) => {
      restore();
      return value;
    },
    (err) => {
      restore();
      throw err;
    },
  );
}

function buildTokenizer(onPercent) {
  if (!tokenizerPromise) {
    tokenizerPromise = withProgress(
      onPercent,
      () =>
        new Promise((resolve, reject) => {
          kuromoji.builder({ dicPath: DICT_PATH }).build((err, tokenizer) => {
            if (err) reject(err);
            else resolve(tokenizer);
          });
        }),
    ).catch((err) => {
      // Let a later attempt rebuild instead of caching the failure forever.
      tokenizerPromise = null;
      throw err;
    });
  }
  return tokenizerPromise;
}

function slim(token) {
  const out = {};
  for (const field of TOKEN_FIELDS) out[field] = token[field];
  return out;
}

self.addEventListener("message", async ({ data }) => {
  const { type, id, text } = data;
  try {
    if (type === "init") {
      await buildTokenizer((percent) => self.postMessage({ type: "progress", percent }));
      self.postMessage({ type: "ready" });
      return;
    }
    if (type === "tokenize") {
      const tokenizer = await buildTokenizer((percent) =>
        self.postMessage({ type: "progress", percent }),
      );
      self.postMessage({ type: "tokens", id, tokens: tokenizer.tokenize(text).map(slim) });
    }
  } catch (err) {
    self.postMessage({ type: "error", id, message: err?.message ?? String(err) });
  }
});
