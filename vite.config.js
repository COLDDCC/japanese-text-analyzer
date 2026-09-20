import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
      // kuromoji's browser loader pulls in zlib.js, which does not survive
      // bundling; see src/vendor/zlib-gunzip.js.
      {
        find: "zlibjs/bin/gunzip.min.js",
        replacement: fileURLToPath(new URL("./src/vendor/zlib-gunzip.js", import.meta.url)),
      },
      // kuromoji's dictionary loader requires Node's `path` for one join().
      {
        find: /^path$/,
        replacement: fileURLToPath(new URL("./src/vendor/path-shim.js", import.meta.url)),
      },
    ],
  },
  worker: { format: "es" },
  build: { target: "es2022" },
});
