// kuromoji part-of-speech tags -> display labels, and the content/function
// split that decides which tokens get a dictionary lookup.

const POS = {
  名詞: { zh: "名词", en: "Noun" },
  動詞: { zh: "动词", en: "Verb" },
  形容詞: { zh: "形容词", en: "i-Adjective" },
  形容動詞語幹: { zh: "形容动词", en: "na-Adjective" },
  副詞: { zh: "副词", en: "Adverb" },
  助詞: { zh: "助词", en: "Particle" },
  助動詞: { zh: "助动词", en: "Auxiliary" },
  連体詞: { zh: "连体词", en: "Pre-noun adjectival" },
  接続詞: { zh: "接续词", en: "Conjunction" },
  感動詞: { zh: "感叹词", en: "Interjection" },
  記号: { zh: "符号", en: "Symbol" },
  接頭詞: { zh: "接头词", en: "Prefix" },
  接尾: { zh: "接尾词", en: "Suffix" },
  フィラー: { zh: "填充词", en: "Filler" },
  代名詞: { zh: "代词", en: "Pronoun" },
  数: { zh: "数词", en: "Numeral" },
  固有名詞: { zh: "专有名词", en: "Proper noun" },
  非自立: { zh: "非自立", en: "Dependent" },
  サ変接続: { zh: "サ变名词", en: "suru-verb noun" },
  副詞可能: { zh: "可作副词", en: "Adverbial noun" },
  その他: { zh: "其他", en: "Other" },
  未知語: { zh: "未知词", en: "Unknown" },
};

// kuromoji's conjugated_form values, for the "Conjugation" row.
const CONJUGATION = {
  基本形: { zh: "基本形", en: "Plain form" },
  未然形: { zh: "未然形", en: "Irrealis (negative stem)" },
  未然ウ接続: { zh: "未然形（接う）", en: "Irrealis, before -u" },
  未然ヌ接続: { zh: "未然形（接ぬ）", en: "Irrealis, before -nu" },
  未然レル接続: { zh: "未然形（接れる）", en: "Irrealis, before -reru" },
  未然特殊: { zh: "未然形（特殊）", en: "Irrealis, special" },
  連用形: { zh: "连用形", en: "Continuative (-masu stem)" },
  連用タ接続: { zh: "连用形（接た）", en: "Continuative, before -ta" },
  連用テ接続: { zh: "连用形（接て）", en: "Continuative, before -te" },
  連用デ接続: { zh: "连用形（接で）", en: "Continuative, before -de" },
  連用ゴザイ接続: { zh: "连用形（接ござい）", en: "Continuative, before -gozai" },
  仮定形: { zh: "假定形", en: "Conditional (-ba)" },
  仮定縮約1: { zh: "假定缩约形", en: "Conditional, contracted" },
  仮定縮約2: { zh: "假定缩约形", en: "Conditional, contracted" },
  命令ｅ: { zh: "命令形", en: "Imperative" },
  命令ｉ: { zh: "命令形", en: "Imperative" },
  命令ｒｏ: { zh: "命令形", en: "Imperative" },
  命令ｙｏ: { zh: "命令形", en: "Imperative" },
  体言接続: { zh: "体言接续", en: "Before a noun" },
  体言接続特殊: { zh: "体言接续（特殊）", en: "Before a noun, special" },
  体言接続特殊２: { zh: "体言接续（特殊）", en: "Before a noun, special" },
  音便基本形: { zh: "音便基本形", en: "Euphonic plain form" },
  ガル接続: { zh: "接がる", en: "Before -garu" },
  文語基本形: { zh: "文语基本形", en: "Classical plain form" },
};

/** A readable name for a token's conjugated form, or null when it has none. */
export function conjugationLabel(token, lang) {
  const form = token.conjugated_form;
  if (!form || form === "*" || form === "基本形") return null;
  const entry = CONJUGATION[form];
  return entry ? (entry[lang] ?? entry.en) : form;
}

// A token is a function word when its main POS is one of these: no dictionary
// lookup, and it renders dimmed.
const FUNCTION_POS = new Set(["助詞", "助動詞", "記号", "フィラー", "その他"]);

// Sub-POS tags that change the word class rather than just refining it, so
// they replace the main POS in the label. 副詞可能 or 非自立 only refine 名詞 /
// 動詞, and stay in the detail line instead.
const PROMOTED_POS = new Set(["形容動詞語幹", "固有名詞", "代名詞", "数"]);

/**
 * Picks the most informative label for a token: 好き is a na-adjective and
 * 東京 a proper noun, even though kuromoji files both under 名詞.
 */
export function posLabel(token, lang) {
  const key = specificPos(token);
  const entry = POS[key];
  if (entry) return entry[lang] ?? entry.en;
  return key;
}

export function specificPos(token) {
  for (const part of [token.pos_detail_1, token.pos_detail_2, token.pos_detail_3]) {
    if (PROMOTED_POS.has(part)) return part;
  }
  return token.pos;
}

/** The full 名詞,固有名詞,地域,一般 style path, trimmed of "*" padding. */
export function posPath(token) {
  return [token.pos, token.pos_detail_1, token.pos_detail_2, token.pos_detail_3]
    .filter((part) => part && part !== "*")
    .join(" · ");
}

export function isFunctionWord(token) {
  if (FUNCTION_POS.has(token.pos)) return true;
  // 非自立 verbs/nouns (いる in 〜ている, こと, もの) behave like grammar, but
  // they still carry meaning, so they stay lookup-able and only render dimmed.
  return false;
}

export function isPunctuation(token) {
  return token.pos === "記号";
}
