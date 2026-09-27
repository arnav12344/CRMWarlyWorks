/** Merge placeholders left behind by src/lib/merge.ts, e.g. [firstName?] or [snippet:Proof?]. */
const PLACEHOLDER_RE = /\[[^\]\n]{1,80}\?\]/g;

export function findPlaceholders(...texts: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const t of texts) for (const m of (t ?? "").match(PLACEHOLDER_RE) ?? []) found.add(m);
  return [...found];
}
