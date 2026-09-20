// Stands in for `zlibjs/bin/gunzip.min.js`, which kuromoji's browser
// dictionary loader requires. It solves two problems at once.
//
// 1. The zlib.js build captures the global object with a top-level `this`.
//    Inside an ES module that `this` is undefined, so bundling it produces
//    "Cannot use 'in' operator to search for 'Zlib' in undefined" the first
//    time the dictionary loads. fflate's gunzip is a drop-in replacement for
//    the one method kuromoji calls.
//
// 2. kuromoji's dictionary files end in .dat.gz, and plenty of static hosts
//    (Vite's own preview server among them) answer with
//    `Content-Encoding: gzip` for those. The browser then unzips them before
//    kuromoji gets a look in, and kuromoji's unzip fails on plain data. So we
//    check for the gzip magic bytes and hand the data straight back when the
//    server already decompressed it.

import { gunzipSync } from "fflate";

const GZIP_MAGIC = [0x1f, 0x8b];

function isGzipped(bytes) {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

class Gunzip {
  constructor(bytes) {
    this.bytes = bytes;
  }

  decompress() {
    return isGzipped(this.bytes) ? gunzipSync(this.bytes) : this.bytes;
  }
}

export const Zlib = { Gunzip };
export default { Zlib };
