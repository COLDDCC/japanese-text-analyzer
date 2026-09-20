// UI copy. Every user-visible string lives here so the 中 / EN toggle is a
// single lookup rather than scattered conditionals.

const STRINGS = {
  zh: {
    eyebrow: "纯前端 · 免费 · 不用注册",
    heading: "把日文拆成一个个词来读",
    tagline: "粘贴日语文本，逐词看读音、原形、词性和英文释义。",
    inputLabel: "输入文本",
    engine: "kuromoji IPA · JMdict",
    placeholder: "在这里粘贴日语文本…\n例：今日はご飯を食べに行きました",
    analyze: "分析",
    analyzing: "分析中…",
    clear: "清空",
    sample: "示例文本",
    charCount: (n, max) => `${n} / ${max} 字`,
    tooLong: (max) => `文本超过 ${max} 字，请分批分析。`,
    loadingDict: "正在加载分词词典…",
    loadingPercent: (p) => `正在加载分词词典… ${p}%`,
    dictReady: "词典已就绪",
    dictFailed: "词典加载失败，请刷新页面重试。",
    emptyInput: "请先输入日语文本。",
    tokenCount: (n) => `共 ${n} 个词`,
    detailsTitle: "词语详情",
    detailsHint: "点击任意词查看详情。",
    baseForm: "原形",
    partOfSpeech: "词性",
    reading: "读音",
    conjugation: "活用",
    meanings: "英文释义",
    noEntry: "词典中未收录该词。",
    functionWord: "语法成分，不查词典。",
    dictEntries: (n) => (n > 1 ? `词典收录 ${n} 条` : ""),
    common: "常用词",
    close: "关闭",
    footer:
      "词典数据：JMdict © EDRDG，CC BY-SA 4.0。分词：kuromoji.js，Apache 2.0。",
  },
  en: {
    eyebrow: "Browser only · Free · No signup",
    heading: "Japanese text, word by word",
    tagline:
      "Paste Japanese text and see every word's reading, dictionary form, part of speech and English meaning.",
    inputLabel: "Input text",
    engine: "kuromoji IPA · JMdict",
    placeholder: "Paste Japanese text here…\ne.g. 今日はご飯を食べに行きました",
    analyze: "Analyze",
    analyzing: "Analyzing…",
    clear: "Clear",
    sample: "Sample text",
    charCount: (n, max) => `${n} / ${max} characters`,
    tooLong: (max) => `Text is longer than ${max} characters. Please split it up.`,
    loadingDict: "Loading tokenizer dictionary…",
    loadingPercent: (p) => `Loading tokenizer dictionary… ${p}%`,
    dictReady: "Dictionary ready",
    dictFailed: "Could not load the dictionary. Please reload the page.",
    emptyInput: "Enter some Japanese text first.",
    tokenCount: (n) => `${n} word${n === 1 ? "" : "s"}`,
    detailsTitle: "Word details",
    detailsHint: "Select any word to see its details.",
    baseForm: "Dictionary form",
    partOfSpeech: "Part of speech",
    reading: "Reading",
    conjugation: "Conjugation",
    meanings: "English meanings",
    noEntry: "No entry found.",
    functionWord: "Grammatical word — no dictionary entry needed.",
    dictEntries: (n) => (n > 1 ? `${n} dictionary entries` : ""),
    common: "Common",
    close: "Close",
    footer:
      "Dictionary data: JMdict © EDRDG, CC BY-SA 4.0. Tokenizer: kuromoji.js, Apache 2.0.",
  },
};

export const LANGUAGES = ["zh", "en"];
const STORAGE_KEY = "wakachi:lang";

export function loadLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(saved)) return saved;
  } catch {
    // Private mode or blocked storage: fall through to the default.
  }
  return navigator.language?.startsWith("zh") ? "zh" : "en";
}

export function saveLanguage(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not worth surfacing — the toggle still works for this session.
  }
}

export function t(lang, key, ...args) {
  const value = STRINGS[lang]?.[key] ?? STRINGS.en[key];
  return typeof value === "function" ? value(...args) : value;
}
