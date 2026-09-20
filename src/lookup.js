// JMdict lookups against the 256 pre-built shards in public/dict/jmdict/.
// A shard is fetched at most once and then kept in memory for the session.

import { shardOf } from "./shard.js";
import { toHiragana } from "./kana.js";

const DICT_BASE = `${import.meta.env?.BASE_URL ?? "/"}dict/jmdict/`;

// A long paste can touch nearly every shard, which would quietly pull the whole
// 13 MB dictionary. Prefetching warms only the first few — enough that the
// words a reader clicks first are instant — and the rest load on demand.
const MAX_PREFETCH_SHARDS = 16;

const shardCache = new Map();

function loadShard(index) {
  let pending = shardCache.get(index);
  if (!pending) {
    pending = fetch(`${DICT_BASE}${index}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`shard ${index}: HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        // Drop the failed promise so a later lookup can retry.
        shardCache.delete(index);
        throw err;
      });
    shardCache.set(index, pending);
  }
  return pending;
}

async function recordsFor(key) {
  if (!key) return null;
  const shard = await loadShard(shardOf(key));
  return shard[key] ?? null;
}

/**
 * The lookup keys to try for a token, most specific first.
 *
 * kuromoji reports the reading of the *surface* form, not of the dictionary
 * form (「行き」 comes back as イキ, not the イク of 「行く」), so the reading is
 * only usable as a filter when the word is not conjugated.
 */
export function candidateKeys(token) {
  const surface = token.surface_form;
  const base = token.basic_form && token.basic_form !== "*" ? token.basic_form : surface;
  const reading = toHiragana(token.reading);

  const keys = [base];
  if (surface !== base) keys.push(surface);
  if (reading && !keys.includes(reading)) keys.push(reading);
  return { keys, base, surface, reading, conjugated: surface !== base };
}

/**
 * Narrows the records stored under one key.
 *
 * An unconjugated word can be disambiguated by its reading — this is what
 * keeps 「今日」きょう apart from 「今日」こんにち. A conjugated one cannot, so it
 * falls back to the shard order, which puts common entries first.
 */
export function pickRecords(records, { key, base, reading, conjugated }) {
  if (conjugated || !reading || key !== base || records.length < 2) return records;
  const matching = records.filter((record) =>
    record.r.some((candidate) => toHiragana(candidate) === reading),
  );
  return matching.length ? matching : records;
}

/**
 * Looks a token up in JMdict.
 * Returns `{ key, records }`; `records` is empty when nothing matched.
 */
export async function lookupToken(token) {
  const context = candidateKeys(token);

  for (const key of context.keys) {
    const records = await recordsFor(key);
    if (!records?.length) continue;
    return { key, records: pickRecords(records, { ...context, key }) };
  }

  return { key: context.base, records: [] };
}

/** Warms the shards the earliest tokens will need, so the first click is instant. */
export function prefetchShards(tokens) {
  const wanted = new Set();
  for (const token of tokens) {
    for (const key of candidateKeys(token).keys) {
      if (key) wanted.add(shardOf(key));
    }
    if (wanted.size >= MAX_PREFETCH_SHARDS) break;
  }
  for (const index of wanted) loadShard(index).catch(() => {});
}
