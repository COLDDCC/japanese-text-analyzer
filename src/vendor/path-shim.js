// kuromoji's DictionaryLoader does `require("path").join(dic_path, filename)`.
// Bundling for the browser only needs join(), so this stands in for the Node
// builtin instead of pulling in a polyfill package.

export function join(...parts) {
  const joined = parts.filter((p) => p !== "" && p != null).join("/");
  // Collapse duplicate slashes, but keep the "//" in "https://host".
  return joined.replace(/([^:]\/)\/+/g, "$1");
}

export default { join };
