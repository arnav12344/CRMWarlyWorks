/**
 * Email normalization used across the app.
 *
 * Email addresses are matched in several places (suppression lookups, contact
 * dedupe within an org, sequence stop checks). Those checks must agree, so we
 * normalize to a single canonical form — trimmed and lowercased — at every
 * WRITE boundary (import, suppression upserts) and every LOOKUP. Without this a
 * differently-cased duplicate (e.g. "Wei@Rosyth.edu.sg" vs
 * "wei@rosyth.edu.sg") could slip past the send-time suppression guard and we
 * could email someone who opted out.
 */

/** Trim + lowercase an email into its canonical form. Returns null for empty. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = String(email).trim().toLowerCase();
  return normalized.length ? normalized : null;
}
