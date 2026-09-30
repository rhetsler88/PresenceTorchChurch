/**
 * Split an id list into fixed-size batches (last batch may be smaller).
 * @param {string[]} ids
 * @param {number} size
 * @returns {string[][]}
 */
export function chunkIds(ids, size) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const batchSize = Math.max(1, Math.floor(size) || 1);
  const batches = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }
  return batches;
}
