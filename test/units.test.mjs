import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hasKanji, isKanaOnly, needsRuby, toHiragana } from "../src/kana.js";
import { conjugationLabel, isFunctionWord, posLabel, posPath, specificPos } from "../src/pos-map.js";
import { SHARD_COUNT, shardOf } from "../src/shard.js";
import { candidateKeys, pickRecords } from "../src/lookup.js";
import { join } from "../src/vendor/path-shim.js";
import { t } from "../src/i18n.js";

const token = (fields) => ({
  surface_form: "",
  basic_form: "*",
  reading: "",
  pos: "名詞",
  pos_detail_1: "*",
  pos_detail_2: "*",
  pos_detail_3: "*",
  conjugated_form: "*",
  ...fields,
});

describe("kana", () => {
  it("converts katakana readings to hiragana", () => {
    assert.equal(toHiragana("トウキョウ"), "とうきょう");
    assert.equal(toHiragana("オイシカッ"), "おいしかっ");
  });

  it("leaves hiragana, kanji and the long vowel mark alone", () => {
    assert.equal(toHiragana("ラーメン"), "らーめん");
    assert.equal(toHiragana("行く"), "行く");
    assert.equal(toHiragana(""), "");
  });

  it("detects kanji and kana-only strings", () => {
    assert.equal(hasKanji("今日"), true);
    assert.equal(hasKanji("こんにちは"), false);
    assert.equal(isKanaOnly("こんにちは"), true);
    assert.equal(isKanaOnly("ラーメン"), true);
    assert.equal(isKanaOnly("今日は"), false);
  });

  it("only adds ruby where the reading tells you something", () => {
    assert.equal(needsRuby("今日", "キョウ"), true);
    assert.equal(needsRuby("ラーメン", "ラーメン"), false, "no kanji, no ruby");
    assert.equal(needsRuby("を", "ヲ"), false);
    assert.equal(needsRuby("行く", ""), false, "unknown reading");
  });
});

describe("part of speech", () => {
  it("promotes sub-tags that change the word class", () => {
    assert.equal(specificPos(token({ pos: "名詞", pos_detail_1: "形容動詞語幹" })), "形容動詞語幹");
    assert.equal(specificPos(token({ pos: "名詞", pos_detail_1: "固有名詞" })), "固有名詞");
  });

  it("keeps the main tag when a sub-tag only refines it", () => {
    assert.equal(specificPos(token({ pos: "名詞", pos_detail_1: "副詞可能" })), "名詞");
    assert.equal(specificPos(token({ pos: "動詞", pos_detail_1: "非自立" })), "動詞");
  });

  it("labels in both interface languages", () => {
    const verb = token({ pos: "動詞", pos_detail_1: "自立" });
    assert.equal(posLabel(verb, "zh"), "动词");
    assert.equal(posLabel(verb, "en"), "Verb");
    assert.equal(posPath(verb), "動詞 · 自立");
  });

  it("treats particles, auxiliaries and punctuation as function words", () => {
    assert.equal(isFunctionWord(token({ pos: "助詞" })), true);
    assert.equal(isFunctionWord(token({ pos: "助動詞" })), true);
    assert.equal(isFunctionWord(token({ pos: "記号" })), true);
    assert.equal(isFunctionWord(token({ pos: "名詞" })), false);
  });

  it("names conjugated forms and stays quiet about plain ones", () => {
    assert.equal(conjugationLabel(token({ conjugated_form: "基本形" }), "en"), null);
    assert.equal(conjugationLabel(token({ conjugated_form: "*" }), "en"), null);
    assert.equal(conjugationLabel(token({ conjugated_form: "連用形" }), "zh"), "连用形");
    assert.match(conjugationLabel(token({ conjugated_form: "連用タ接続" }), "en"), /Continuative/);
  });
});

describe("shard hashing", () => {
  it("stays inside the shard range", () => {
    for (const key of ["行く", "こんにちは", "ラーメン", "a", ""]) {
      const index = shardOf(key);
      assert.ok(Number.isInteger(index) && index >= 0 && index < SHARD_COUNT, key);
    }
  });

  it("is stable, so the build script and the browser agree", () => {
    assert.equal(shardOf("行く"), shardOf("行く"));
    assert.notEqual(shardOf("行く"), shardOf("食べる"));
  });

  it("spreads keys reasonably evenly", () => {
    const counts = new Array(SHARD_COUNT).fill(0);
    for (let i = 0; i < 25600; i += 1) counts[shardOf(`語${i}`)] += 1;
    const max = Math.max(...counts);
    assert.ok(max < 100 * 2, `worst shard held ${max} of an expected 100`);
  });
});

describe("lookup keys", () => {
  it("prefers the dictionary form, then the surface, then the reading", () => {
    const { keys, conjugated } = candidateKeys(
      token({ surface_form: "行き", basic_form: "行く", reading: "イキ" }),
    );
    assert.deepEqual(keys, ["行く", "行き", "いき"]);
    assert.equal(conjugated, true);
  });

  it("falls back to the surface form when kuromoji has no base form", () => {
    const { keys, conjugated } = candidateKeys(
      token({ surface_form: "ラーメン", basic_form: "*", reading: "ラーメン" }),
    );
    assert.deepEqual(keys, ["ラーメン", "らーめん"]);
    assert.equal(conjugated, false);
  });

  it("filters by reading only for unconjugated words", () => {
    const kyou = { k: "今日", r: ["きょう"], g: ["today"], c: 1 };
    const konnichi = { k: "今日", r: ["こんにち"], g: ["these days"] };
    const records = [kyou, konnichi];

    assert.deepEqual(
      pickRecords(records, { key: "今日", base: "今日", reading: "きょう", conjugated: false }),
      [kyou],
    );
    // A conjugated word's reading belongs to the surface form, so it must not filter.
    assert.deepEqual(
      pickRecords(records, { key: "行く", base: "行く", reading: "いき", conjugated: true }),
      records,
    );
  });

  it("keeps every record when the reading matches none of them", () => {
    const records = [{ k: "今日", r: ["きょう"], g: ["today"] }, { k: "今日", r: ["こんにち"], g: [] }];
    assert.deepEqual(
      pickRecords(records, { key: "今日", base: "今日", reading: "ほげ", conjugated: false }),
      records,
    );
  });
});

describe("path shim", () => {
  it("joins dictionary URLs without doubling slashes", () => {
    assert.equal(join("/dict/kuromoji", "base.dat.gz"), "/dict/kuromoji/base.dat.gz");
    assert.equal(join("/dict/kuromoji/", "base.dat.gz"), "/dict/kuromoji/base.dat.gz");
  });

  it("keeps the double slash in an absolute URL", () => {
    assert.equal(join("https://cdn.example/dict", "cc.dat.gz"), "https://cdn.example/dict/cc.dat.gz");
  });
});

describe("i18n", () => {
  it("has both languages for every key used by the UI", () => {
    for (const key of ["analyze", "baseForm", "noEntry", "footer", "detailsHint"]) {
      assert.ok(t("zh", key), `zh: ${key}`);
      assert.ok(t("en", key), `en: ${key}`);
    }
  });

  it("formats counted strings", () => {
    assert.equal(t("en", "tokenCount", 1), "1 word");
    assert.equal(t("en", "tokenCount", 3), "3 words");
    assert.equal(t("zh", "charCount", 30, 5000), "30 / 5000 字");
  });

  it("falls back to English for an unknown language", () => {
    assert.equal(t("fr", "analyze"), "Analyze");
  });
});
