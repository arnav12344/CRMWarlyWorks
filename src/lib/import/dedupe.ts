/**
 * Organization deduplication.
 *
 * Scraper exports return the same business across many per-city subtask rows, so
 * the same organization shows up repeatedly. We collapse duplicates using a
 * stable dedupeKey:
 *   - preferred: normalized email/website DOMAIN (e.g. "acme.org")
 *   - fallback:  normalized name + city
 *
 * The dedupeKey doubles as Organization.dedupeKey (a unique column in Prisma),
 * so two subtask rows for the same business merge into one Organization.
 */

/** Extract a bare, lowercased registrable-ish domain from a URL or email. */
export function normalizeDomain(input?: string | null): string | undefined {
  if (!input) return undefined;
  let value = String(input).trim().toLowerCase();
  if (!value) return undefined;

  // Email -> take the part after @.
  if (value.includes("@")) {
    const parts = value.split("@");
    value = parts[parts.length - 1] ?? "";
  }

  // Strip scheme, path, query, and leading www.
  value = value.replace(/^[a-z]+:\/\//, "");
  value = value.replace(/^www\./, "");
  value = value.split("/")[0] ?? value;
  value = value.split("?")[0] ?? value;
  value = value.split("#")[0] ?? value;
  value = value.split(":")[0] ?? value; // drop port
  value = value.trim();

  if (!value || !value.includes(".")) return undefined;
  return value;
}

/** Normalize a free-text string for use in a dedupe key. */
export function normalizeText(input?: string | null): string {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface DedupeInput {
  name?: string;
  website?: string;
  email?: string;
  city?: string;
}

/**
 * Compute the dedupe key for an organization. Prefers a normalized domain
 * (from website, else email); falls back to normalized name + city.
 * Returns null when there is not enough information to key on.
 */
export function computeDedupeKey(input: DedupeInput): string | null {
  const domain =
    normalizeDomain(input.website) ?? normalizeDomain(input.email);
  if (domain) return `domain:${domain}`;

  const name = normalizeText(input.name);
  if (!name) return null;
  const city = normalizeText(input.city);
  return city ? `name:${name}|city:${city}` : `name:${name}`;
}

export interface DedupedOrg<T> {
  dedupeKey: string;
  /** The merged record (first-seen wins, later non-empty fields fill gaps). */
  record: T;
  /** How many source candidates collapsed into this org. */
  mergedCount: number;
}

/**
 * Group candidates by dedupe key, merging fields so that later rows fill in any
 * gaps left by earlier ones (first non-empty value wins). Candidates without a
 * computable key are kept as their own unique entries.
 */
export function dedupeOrganizations<T extends DedupeInput & Record<string, unknown>>(
  candidates: T[]
): DedupedOrg<T>[] {
  const byKey = new Map<string, DedupedOrg<T>>();
  const result: DedupedOrg<T>[] = [];
  let anonSeq = 0;

  for (const candidate of candidates) {
    const key =
      computeDedupeKey(candidate) ?? `anon:${anonSeq++}`;
    const existing = byKey.get(key);

    if (!existing) {
      const entry: DedupedOrg<T> = {
        dedupeKey: key,
        record: { ...candidate },
        mergedCount: 1,
      };
      byKey.set(key, entry);
      result.push(entry);
      continue;
    }

    // Merge: fill only empty fields on the existing record.
    for (const [field, value] of Object.entries(candidate)) {
      const current = (existing.record as Record<string, unknown>)[field];
      const isEmpty =
        current === undefined ||
        current === null ||
        (typeof current === "string" && current.trim() === "");
      const hasValue =
        value !== undefined &&
        value !== null &&
        !(typeof value === "string" && value.trim() === "");
      if (isEmpty && hasValue) {
        (existing.record as Record<string, unknown>)[field] = value;
      }
    }
    existing.mergedCount += 1;
  }

  return result;
}
