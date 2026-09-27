/**
 * Chunking helpers. Serverless functions have a short time limit, so long
 * jobs (import, verify, bulk send) are split into small requests driven by the
 * browser.
 */

/** Split `total` items into [offset, limit] windows of at most `size`. */
export function chunkRanges(total: number, size: number): Array<{ offset: number; limit: number }> {
  const n = Math.max(0, Math.floor(total));
  const s = Math.max(1, Math.floor(size));
  const out: Array<{ offset: number; limit: number }> = [];
  for (let offset = 0; offset < n; offset += s) out.push({ offset, limit: Math.min(s, n - offset) });
  return out;
}

/** Split an array into consecutive chunks of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  return chunkRanges(items.length, size).map(({ offset, limit }) => items.slice(offset, offset + limit));
}

/** Next offset after processing a window, or null when finished. */
export function nextOffset(offset: number, limit: number, total: number): number | null {
  const next = offset + limit;
  return next < total ? next : null;
}
