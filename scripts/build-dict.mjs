/*
 * Builds the JMdict lookup shards served from public/dict/jmdict/.
 *
 * Source: JMdict, via the `jamdict-data` package on PyPI, which ships the
 * whole dictionary as a single SQLite file. JMdict is the property of the
 * Electronic Dictionary Research and Development Group, used under CC BY-SA 4.0.
 *
 * This only has to run when the dictionary is refreshed; the generated shards
 * are committed, so a normal `npm run build` never touches it.
 *
 * By default only JMdict's "common" entries are kept (~46k), which is what v1
 * ships. Pass --all for the whole dictionary (~191k entries, ~54 MB).
 *
 *   node scripts/build-dict.mjs [--all] [--out public/dict/jmdict]
 */

import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import path from "node:path";
import { SHARD_COUNT, shardOf } from "../src/shard.js";
import { toHiragana } from "../src/kana.js";

const run = promisify(execFile);

const PYPI_PACKAGE = "https://pypi.org/pypi/jamdict-data/json";
const CACHE_DIR = path.resolve("node_modules/.cache/jmdict");
const MAX_GLOSSES = 3;
const MAX_READINGS = 3;
const MAX_POS = 4;
// The priority tags JMdict uses to mark an entry as everyday vocabulary.
const COMMON_TAGS = new Set(["news1", "ichi1", "spec1", "spec2", "gai1"]);

const args = process.argv.slice(2);
const commonOnly = !args.includes("--all");
const outDir = path.resolve(
  args.includes("--out") ? args[args.indexOf("--out") + 1] : "public/dict/jmdict",
);

/** Long JMdict part-of-speech names -> the short label we show in the entry. */
const POS_RULES = [
  [/^noun \(common\)/, "noun"],
  [/^noun or participle which takes the aux\. verb suru/, "suru verb"],
  [/^suru verb/, "suru verb"],
  [/^nouns which may take the genitive/, "no-adjective"],
  [/^noun, used as a suffix/, "noun suffix"],
  [/^noun, used as a prefix/, "noun prefix"],
  [/^noun or verb acting prenominally/, "prenominal"],
  [/^adjectival nouns or quasi-adjectives/, "na-adjective"],
  [/^archaic\/formal form of na-adjective/, "na-adjective"],
  [/^adjective \(keiyoushi\)/, "i-adjective"],
  [/^auxiliary adjective/, "auxiliary adjective"],
  [/adjective \(archaic\)/, "adjective (archaic)"],
  [/^'taru' adjective/, "taru-adjective"],
  [/^pre-noun adjectival/, "pre-noun adjectival"],
  [/^adverb/, "adverb"],
  [/^Ichidan verb/, "ichidan verb"],
  [/^Godan verb/, "godan verb"],
  [/^Kuru verb/, "kuru verb"],
  [/^su verb/, "suru verb"],
  [/^Yodan verb/, "yodan verb (archaic)"],
  [/^Nidan verb/, "nidan verb (archaic)"],
  [/^irregular/, "irregular verb"],
  [/^transitive verb/, "transitive"],
  [/^intransitive verb/, "intransitive"],
  [/^auxiliary verb/, "auxiliary verb"],
  [/^auxiliary$/, "auxiliary"],
  [/^copula/, "copula"],
  [/^expressions/, "expression"],
  [/^interjection/, "interjection"],
  [/^conjunction/, "conjunction"],
  [/^particle/, "particle"],
  [/^pronoun/, "pronoun"],
  [/^numeric/, "numeric"],
  [/^counter/, "counter"],
  [/^prefix/, "prefix"],
  [/^suffix/, "suffix"],
];

function shortPos(text) {
  for (const [re, label] of POS_RULES) if (re.test(text)) return label;
  return null;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Downloads and unpacks jamdict.db once, then reuses the cached copy. */
async function ensureDatabase() {
  const dbPath = path.join(CACHE_DIR, "jamdict.db");
  if (await exists(dbPath)) return dbPath;

  await mkdir(CACHE_DIR, { recursive: true });
  console.log("Fetching jamdict-data from PyPI (~54 MB, one time)…");

  const meta = await (await fetch(PYPI_PACKAGE)).json();
  const sdist = meta.urls.find((u) => u.filename.endsWith(".tar.gz"));
  if (!sdist) throw new Error("no sdist found for jamdict-data");

  const tarball = path.join(CACHE_DIR, sdist.filename);
  const res = await fetch(sdist.url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tarball));

  await run("tar", ["xzf", tarball, "-C", CACHE_DIR]);
  const [pkgDir] = (await readdir(CACHE_DIR)).filter((n) => n.startsWith("jamdict_data-"));
  const xz = path.join(CACHE_DIR, pkgDir, "jamdict_data", "jamdict.db.xz");

  console.log("Decompressing jamdict.db (~311 MB)…");
  await run("xz", ["-dk", "-T0", xz]);
  await run("mv", [xz.replace(/\.xz$/, ""), dbPath]);
  await rm(tarball, { force: true });
  return dbPath;
}

function readEntries(db) {
  const by = (rows, key) => {
    const map = new Map();
    for (const row of rows) {
      const list = map.get(row[key]);
      if (list) list.push(row);
      else map.set(row[key], [row]);
    }
    return map;
  };

  console.log("Reading tables…");
  const kanji = db.prepare("SELECT ID, idseq, text FROM Kanji ORDER BY ID").all();
  const kana = db.prepare("SELECT ID, idseq, text FROM Kana ORDER BY ID").all();
  const senses = db.prepare("SELECT ID, idseq FROM Sense ORDER BY ID").all();
  const glosses = db
    .prepare("SELECT sid, text FROM SenseGloss WHERE lang IS NULL OR lang IN ('eng','en') ORDER BY rowid")
    .all();
  const poses = db.prepare("SELECT sid, text FROM pos").all();
  const kanjiPri = db.prepare("SELECT kid, text FROM KJP").all();
  const kanaPri = db.prepare("SELECT kid, text FROM KNP").all();

  const kanjiByEntry = by(kanji, "idseq");
  const kanaByEntry = by(kana, "idseq");
  const sensesByEntry = by(senses, "idseq");
  const glossesBySense = by(glosses, "sid");
  const posBySense = by(poses, "sid");

  const priorityIds = new Set();
  for (const row of [...kanjiPri, ...kanaPri]) {
    if (COMMON_TAGS.has(row.text)) priorityIds.add(row.kid);
  }

  const entries = [];
  for (const { idseq } of db.prepare("SELECT idseq FROM Entry").all()) {
    const kanjiForms = kanjiByEntry.get(idseq) ?? [];
    const kanaForms = kanaByEntry.get(idseq) ?? [];
    if (!kanaForms.length) continue;

    const glossList = [];
    const posList = [];
    for (const sense of sensesByEntry.get(idseq) ?? []) {
      for (const g of glossesBySense.get(sense.ID) ?? []) {
        if (glossList.length < MAX_GLOSSES) glossList.push(g.text);
      }
      for (const p of posBySense.get(sense.ID) ?? []) {
        const label = shortPos(p.text);
        if (label && !posList.includes(label) && posList.length < MAX_POS) posList.push(label);
      }
    }
    if (!glossList.length) continue;

    const common =
      kanjiForms.some((f) => priorityIds.has(f.ID)) || kanaForms.some((f) => priorityIds.has(f.ID));
    if (commonOnly && !common) continue;

    // JMdict lists some words twice in kana, e.g. おいしい and オイシイ. Both stay
    // lookup keys, but only the hiragana one is worth showing as a reading.
    const readings = [];
    for (const form of kanaForms) {
      if (!readings.some((existing) => toHiragana(existing) === toHiragana(form.text))) {
        readings.push(form.text);
      }
    }

    entries.push({
      writings: [...kanjiForms.map((f) => f.text), ...kanaForms.map((f) => f.text)],
      record: {
        k: kanjiForms.length ? kanjiForms[0].text : null,
        r: readings.slice(0, MAX_READINGS),
        g: glossList,
        p: posList.join(" · "),
        ...(common ? { c: 1 } : {}),
      },
    });
  }
  return entries;
}

async function main() {
  const dbPath = await ensureDatabase();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const entries = readEntries(db);
  db.close();
  console.log(`Kept ${entries.length} entries.`);

  // One shard per hash bucket; a shard maps writing -> list of records.
  const shards = Array.from({ length: SHARD_COUNT }, () => ({}));
  let keyCount = 0;
  for (const { writings, record } of entries) {
    for (const writing of new Set(writings)) {
      const shard = shards[shardOf(writing)];
      if (!shard[writing]) {
        shard[writing] = [];
        keyCount += 1;
      }
      // Common entries first so the UI can prefer them without sorting.
      if (record.c) shard[writing].unshift(record);
      else shard[writing].push(record);
    }
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  let bytes = 0;
  for (let i = 0; i < SHARD_COUNT; i += 1) {
    const json = JSON.stringify(shards[i]);
    bytes += Buffer.byteLength(json);
    await writeFile(path.join(outDir, `${i}.json`), json);
  }

  await writeFile(
    path.join(outDir, "meta.json"),
    JSON.stringify({
      shards: SHARD_COUNT,
      keys: keyCount,
      entries: entries.length,
      commonOnly,
      source: "JMdict via jamdict-data (PyPI)",
      license: "JMdict © EDRDG, CC BY-SA 4.0",
      builtAt: new Date().toISOString().slice(0, 10),
    }),
  );

  console.log(
    `Wrote ${SHARD_COUNT} shards + meta.json to ${path.relative(process.cwd(), outDir)} ` +
      `(${keyCount} keys, ${(bytes / 1e6).toFixed(1)} MB, avg ${(bytes / SHARD_COUNT / 1024).toFixed(0)} KB/shard).`,
  );
}

await main();
