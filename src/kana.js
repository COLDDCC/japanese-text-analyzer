// Kana helpers. kuromoji hands back readings in katakana; we show hiragana.

const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6; // ヶ
const TO_HIRAGANA = 0x60;

const KANJI = /[一-龯㐀-䶿]/;
const KANA_ONLY = /^[぀-ゟ゠-ヿー々]+$/;

/** カタカナ -> ひらがな. Characters outside the katakana block pass through. */
export function toHiragana(text) {
  if (!text) return "";
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    out +=
      code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCodePoint(code - TO_HIRAGANA)
        : char;
  }
  return out;
}

export function hasKanji(text) {
  return KANJI.test(text ?? "");
}

export function isKanaOnly(text) {
  return KANA_ONLY.test(text ?? "");
}

/**
 * True when a reading is worth showing above the surface form: it has to
 * contain kanji, and the reading has to actually differ from what is written.
 */
export function needsRuby(surface, reading) {
  if (!reading || !hasKanji(surface)) return false;
  return toHiragana(surface) !== toHiragana(reading);
}
