// Shared by the browser and by scripts/build-dict.mjs: both sides must agree
// on which shard file a dictionary key lives in.

export const SHARD_COUNT = 256;

/** FNV-1a over UTF-16 code units. Small, stable, and identical in Node and browsers. */
export function shardOf(key) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % SHARD_COUNT;
}
