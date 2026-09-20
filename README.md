# Wakachi

Paste a block of Japanese, get it split into words — each one showing its
reading, dictionary form, part of speech and English meaning.

Everything runs in the browser. There is no backend, no API key and nothing to
pay for: the tokenizer and the dictionary are both static files.

[中文说明](README.zh-CN.md)

## What it does

- Splits pasted text into words with [kuromoji.js](https://github.com/takuyaa/kuromoji.js)
  (IPA dictionary), in a Web Worker so long text never freezes the page.
- Puts furigana above every word that contains kanji.
- Shows content words in full colour with a thin underline; particles,
  auxiliaries and punctuation are dimmed.
- On click, opens a panel with the surface form, the reading, the dictionary
  form (「行き → 行く」), the part of speech, the conjugated form and up to three
  English glosses from JMdict.
- Switches the interface between 中文 and English; the choice is remembered.
- Handles up to 5,000 characters at a time.

## Running it

```bash
npm install
npm run dev
```

Then open the printed URL. Opening `index.html` straight off disk will not
work — the dictionaries are fetched over HTTP.

```bash
npm run build     # static site into dist/
npm run preview   # serve dist/ locally
npm test          # unit tests + the acceptance sentences
```

The first page load pulls kuromoji's ~18 MB dictionary, which takes a few
seconds; a progress bar shows how far along it is, and the browser caches it
afterwards.

## How it fits together

```
paste
  → worker.js        kuromoji splits the text into tokens
  → kana.js          katakana readings become hiragana
  → pos-map.js       kuromoji's POS tags become labels, and decide
                     which tokens are content words worth looking up
  → lookup.js        content words are looked up in JMdict
  → render.js        word blocks, ruby, details panel
```

| Path | What lives there |
| --- | --- |
| `src/worker.js` | Tokenizer worker, with dictionary load progress |
| `src/lookup.js` | JMdict lookups, shard cache, matching rules |
| `src/render.js` | Word stream and details panel DOM |
| `src/pos-map.js` | kuromoji POS and conjugation tags → 中 / EN labels |
| `src/kana.js` | Kana conversion and the "does this need ruby" test |
| `src/i18n.js` | Every user-visible string |
| `src/shard.js` | The hash the build script and the browser must agree on |
| `scripts/build-dict.mjs` | Builds the JMdict shards (see below) |
| `scripts/prepare-kuromoji.mjs` | Copies kuromoji's dictionary into `public/` |

### Why the dictionary is sharded

JMdict's common entries come to ~14 MB of JSON — too much to load up front. The
build script hashes every writing of every entry (kanji forms and kana forms
alike), takes it modulo 256, and writes one file per bucket. Looking a word up
fetches only its bucket, about 52 KB, and the browser keeps each bucket it has
already fetched.

### The matching rules

kuromoji reports the reading of the *surface* form, not of the dictionary form:
「行き」 comes back as イキ, not the イク of 「行く」. So:

1. Look the dictionary form up first, then the surface form, then the reading.
2. If the word is *not* conjugated, narrow the results by reading. This is what
   tells 「今日」きょう from 「今日」こんにち.
3. If the word *is* conjugated, ignore the reading and take the entries in
   shard order, which puts common entries first.
4. If nothing matches — a name, a rare word, slang — the panel says
   "No entry found" rather than failing.

## Rebuilding the dictionary data

Both dictionaries are generated, not hand-maintained.

kuromoji's dictionary is copied out of `node_modules` by
`npm run dict:kuromoji`, which `dev` and `build` run for you. It is not
committed.

The JMdict shards in `public/dict/jmdict/` **are** committed, so a deploy needs
nothing but `npm run build`. To refresh them:

```bash
npm run dict:jmdict          # JMdict's common entries (~46k), what v1 ships
node scripts/build-dict.mjs --all   # the whole dictionary (~191k, ~54 MB)
```

The script downloads [`jamdict-data`](https://pypi.org/project/jamdict-data/)
from PyPI — JMdict packaged as a single SQLite file — and caches it under
`node_modules/.cache/jmdict/`. It needs the `tar` and `xz` command-line tools.

## Deploying to Cloudflare Pages

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |

`public/_headers` ships with the site and tells the edge to serve
`dict/kuromoji/*` as `application/octet-stream`, so it does not add
`Content-Encoding: gzip` to files that are already gzipped.

That double-compression trap is worth knowing about: kuromoji unzips the `.gz`
dictionary files itself, so if a host also advertises them as gzip, the browser
unzips them first and kuromoji then chokes on plain data. Wakachi checks for
the gzip magic bytes before unzipping, so it works either way — but if you see
`invalid gzip data` on a new host, this is what to look at.

## Design

The visual system — the graph-paper field, the squared-off cards, Anybody over
IBM Plex, blue for structure, green for confirmation, red for warnings — is
taken from [COLDDCC/design-reference](https://github.com/COLDDCC/design-reference),
specifically its `graph-paper-site` entry.

Two things were adapted rather than copied:

- **The typefaces are self-hosted**, in `public/fonts/`, instead of loaded from
  Google Fonts. Readers of a Japanese-reading tool with a Chinese interface are
  often somewhere `fonts.googleapis.com` does not resolve, and a site whose
  whole premise is "static files, no backend" should not fall over on a CDN.
  Only the latin subsets ship (165 KB for six faces); Japanese and Chinese fall
  through to system fonts.
- **Dark mode was added.** The reference is light-only, so the dark palette
  reads the same system at night: the same structure, the same three accent
  colours, less glare.

## Known limits in v1

- The IPA dictionary splits some compounds finer than you might want
  (「東京都庁」 comes apart). v1 accepts that.
- Glosses are the first three from the entry, so a word with many senses shows
  only the start of the list.
- Proper names and internet slang are not in JMdict's common set and come back
  as "No entry found".
- The first load is slow — ~18 MB of tokenizer dictionary — and then cached.

## Roadmap

- **v2** — conjugation breakdown: 「行きました = 行く + ます + た」, explained piece
  by piece.
- **v3** — a known-words list, stored locally and keyed by dictionary form, so
  only new words are highlighted.
- **v4** — export new words to Anki or CSV.

## Licences

The code is MIT licensed — see [LICENSE](LICENSE).

The data it serves is not:

- **JMdict** is the property of the
  [Electronic Dictionary Research and Development Group](https://www.edrdg.org/),
  used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  The shards in `public/dict/jmdict/` are a derivative of it.
- **kuromoji.js** and its IPA dictionary are Apache 2.0.
- **Anybody**, **IBM Plex Sans** and **IBM Plex Mono**, in `public/fonts/`, are
  under the SIL Open Font License 1.1 — see `public/fonts/LICENSE.txt`.

Both are credited in the page footer, which is how the licences ask to be
honoured — please keep it there.
