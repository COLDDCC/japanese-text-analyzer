// Runs the v1 acceptance sentences through the real tokenizer and the real
// dictionary shards, checking segmentation and that lookups resolve.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import kuromoji from "kuromoji";

import { candidateKeys, pickRecords } from "../src/lookup.js";
import { shardOf } from "../src/shard.js";
import { isFunctionWord } from "../src/pos-map.js";
import { toHiragana } from "../src/kana.js";

const SHARD_DIR = path.resolve("public/dict/jmdict");
const shards = new Map();

async function shard(index) {
  if (!shards.has(index)) {
    shards.set(index, JSON.parse(await readFile(path.join(SHARD_DIR, `${index}.json`), "utf8")));
  }
  return shards.get(index);
}

/** The browser's lookupToken(), with the fetch swapped for a disk read. */
async function lookup(token) {
  const context = candidateKeys(token);
  for (const key of context.keys) {
    const records = (await shard(shardOf(key)))[key];
    if (records?.length) return { key, records: pickRecords(records, { ...context, key }) };
  }
  return { key: context.base, records: [] };
}

let tokenizer;

before(async () => {
  tokenizer = await new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: path.resolve("node_modules/kuromoji/dict") })
      .build((err, built) => (err ? reject(err) : resolve(built)));
  });
});

const tokenize = (text) => tokenizer.tokenize(text);
const find = (tokens, surface) => tokens.find((t) => t.surface_form === surface);

describe("segmentation", () => {
  const cases = [
    ["今日はご飯を食べに行きました", ["今日", "は", "ご飯", "を", "食べ", "に", "行き", "まし", "た"]],
    ["本を読んでいます", ["本", "を", "読ん", "で", "い", "ます"]],
    ["昨日は行かなかった", ["昨日", "は", "行か", "なかっ", "た"]],
    ["ラーメンが美味しかった", ["ラーメン", "が", "美味しかっ", "た"]],
    ["東京に住んでいる", ["東京", "に", "住ん", "で", "いる"]],
    ["猫が好きです", ["猫", "が", "好き", "です"]],
    ["今日は、こんにちは。", ["今日", "は", "、", "こんにちは", "。"]],
  ];

  for (const [sentence, expected] of cases) {
    it(sentence, () => {
      assert.deepEqual(
        tokenize(sentence).map((t) => t.surface_form),
        expected,
      );
    });
  }
});

describe("dictionary form and reading", () => {
  it("行き resolves to 行く", () => {
    const token = find(tokenize("今日はご飯を食べに行きました"), "行き");
    assert.equal(token.basic_form, "行く");
    // kuromoji reports the reading of the surface form, not of the base form.
    assert.equal(toHiragana(token.reading), "いき");
  });

  it("美味しかっ resolves to 美味しい", () => {
    const token = find(tokenize("ラーメンが美味しかった"), "美味しかっ");
    assert.equal(token.basic_form, "美味しい");
  });

  it("好き is tagged as a na-adjective stem", () => {
    const token = find(tokenize("猫が好きです"), "好き");
    assert.equal(token.pos_detail_1, "形容動詞語幹");
  });

  it("東京 is tagged as a place name", () => {
    const token = find(tokenize("東京に住んでいる"), "東京");
    assert.equal(token.pos_detail_1, "固有名詞");
  });
});

describe("lookups", () => {
  const expectations = [
    ["今日はご飯を食べに行きました", "行き", "行く", "to go"],
    ["今日はご飯を食べに行きました", "食べ", "食べる", "to eat"],
    ["今日はご飯を食べに行きました", "ご飯", "ご飯", "cooked rice"],
    ["本を読んでいます", "読ん", "読む", "to read"],
    ["昨日は行かなかった", "行か", "行く", "to go"],
    ["ラーメンが美味しかった", "美味しかっ", "美味しい", "delicious"],
    ["ラーメンが美味しかった", "ラーメン", "ラーメン", "ramen"],
    ["東京に住んでいる", "住ん", "住む", "to live"],
    ["猫が好きです", "猫", "猫", "cat"],
    ["猫が好きです", "好き", "好き", "liked"],
  ];

  for (const [sentence, surface, expectedKey, expectedGloss] of expectations) {
    it(`${surface} → ${expectedKey} (${expectedGloss})`, async () => {
      const result = await lookup(find(tokenize(sentence), surface));
      assert.equal(result.key, expectedKey);
      const glosses = result.records.flatMap((r) => r.g).join(" | ").toLowerCase();
      assert.ok(
        glosses.includes(expectedGloss),
        `expected a gloss containing "${expectedGloss}", got: ${glosses}`,
      );
    });
  }

  it("picks きょう over こんにち for 今日", async () => {
    const result = await lookup(find(tokenize("今日は、こんにちは。"), "今日"));
    assert.ok(
      result.records.every((r) => r.r.some((reading) => toHiragana(reading) === "きょう")),
      `expected only きょう entries, got ${JSON.stringify(result.records.map((r) => r.r))}`,
    );
    assert.ok(result.records[0].g.includes("today"));
  });

  it("こんにちは is looked up as a greeting, not as 今日 + は", async () => {
    const tokens = tokenize("今日は、こんにちは。");
    const result = await lookup(find(tokens, "こんにちは"));
    assert.ok(result.records.flatMap((r) => r.g).some((g) => /hello|good day/i.test(g)));
  });

  it("returns no records for an invented word instead of throwing", async () => {
    const result = await lookup(find(tokenize("ぬるぽガッ"), "ぬるぽ") ?? tokenize("ぬるぽ")[0]);
    assert.equal(Array.isArray(result.records), true);
  });

  it("every content word in the acceptance set resolves", async () => {
    const sentences = [
      "今日はご飯を食べに行きました",
      "本を読んでいます",
      "昨日は行かなかった",
      "ラーメンが美味しかった",
      "東京に住んでいる",
      "猫が好きです",
      "今日は、こんにちは。",
    ];
    const misses = [];
    for (const sentence of sentences) {
      for (const token of tokenize(sentence)) {
        if (isFunctionWord(token) || token.pos_detail_1 === "非自立") continue;
        const result = await lookup(token);
        if (!result.records.length) misses.push(`${sentence}: ${token.surface_form}`);
      }
    }
    assert.deepEqual(misses, []);
  });
});

after(() => {
  // kuromoji keeps no handles open; nothing to tear down.
});
