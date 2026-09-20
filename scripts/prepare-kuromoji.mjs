// Copies kuromoji's dictionary out of node_modules and into public/, where it
// is served as a static asset. Runs before `dev` and `build` so the files are
// never committed — they belong to the dependency.

import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const source = path.resolve("node_modules/kuromoji/dict");
const target = path.resolve("public/dict/kuromoji");

const files = (await readdir(source)).filter((name) => name.endsWith(".dat.gz"));
if (!files.length) throw new Error(`no dictionary files in ${source} — run npm install first`);

await mkdir(target, { recursive: true });
for (const name of files) {
  await cp(path.join(source, name), path.join(target, name));
}
console.log(`kuromoji dictionary ready (${files.length} files) in public/dict/kuromoji/`);
