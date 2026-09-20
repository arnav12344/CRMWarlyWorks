/**
 * Nested-JSON extraction for the Google-Maps-style scraper export.
 *
 * The raw export is NOT a clean lead list. Each row is a scraper TASK/JOB
 * record: a parent job row plus per-city subtask rows. The real business/lead
 * data is buried inside JSON strings in columns named `data`, `metadata`, and
 * sometimes even `error`. A single `data` blob can hold a single business or an
 * ARRAY of businesses (one scraper task returning many map results).
 *
 * This module:
 *   1. Parses the JSON-bearing columns (default: data, metadata, error).
 *   2. Recursively walks the parsed structure to surface embedded business
 *      objects (anything that looks like it has a name/website/phone/etc.).
 *   3. Flattens parent + subtask rows so that each DISCOVERED BUSINESS becomes
 *      one candidate organization — not one candidate per scraper task.
 *
 * All objects are rebuilt as plain objects (no prototype merges) to stay safe
 * against prototype-pollution from the untrusted xlsx/JSON input.
 */

/** Columns that commonly carry embedded JSON in scraper exports. */
export const DEFAULT_JSON_COLUMNS = ["data", "metadata", "error"];

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** A flattened business candidate with normalized field names. */
export interface BusinessCandidate {
  name?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  categories?: string;
  title?: string;
  fullName?: string;
  /** Any additional surfaced scalar fields, keyed by their source name. */
  extra: Record<string, string>;
}

/** Field-name aliases mapped onto our canonical business fields. */
const FIELD_ALIASES: Record<keyof Omit<BusinessCandidate, "extra">, RegExp> = {
  name: /^(name|business[_-]?name|company|company[_-]?name|title|org|organization)$/i,
  website: /^(website|web|url|site|homepage|domain|link)$/i,
  phone: /^(phone|phone[_-]?number|tel|telephone|mobile|contact[_-]?number)$/i,
  email: /^(email|e[_-]?mail|email[_-]?address|contact[_-]?email)$/i,
  address: /^(address|full[_-]?address|formatted[_-]?address|street|location)$/i,
  city: /^(city|town|locality)$/i,
  country: /^(country|nation)$/i,
  categories: /^(categor(y|ies)|type|business[_-]?type|tags)$/i,
  title: /^(job[_-]?title|role|position|designation)$/i,
  fullName: /^(full[_-]?name|contact[_-]?name|person|owner|contact[_-]?person)$/i,
};

/** Keys we recognise as "this object is likely a business record". */
const BUSINESS_SIGNAL_KEYS = [
  "name",
  "business_name",
  "website",
  "phone",
  "email",
  "address",
  "categories",
];

/** Safely JSON.parse a string; returns undefined on failure. */
export function tryParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value ?? undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^[[{]/.test(trimmed)) return undefined; // only object/array blobs
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/** Does this plain object look like a business/lead record? */
function looksLikeBusiness(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj).map((k) => k.toLowerCase());
  let signals = 0;
  for (const key of keys) {
    if (BUSINESS_SIGNAL_KEYS.includes(key)) signals += 1;
    // Alias match also counts as a signal.
    for (const re of Object.values(FIELD_ALIASES)) {
      if (re.test(key)) {
        signals += 1;
        break;
      }
    }
  }
  return signals >= 2;
}

/** Convert a raw scalar to a trimmed string, or undefined if not scalar/empty. */
function scalarToString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => scalarToString(v))
      .filter((v): v is string => Boolean(v));
    return parts.length ? parts.join(", ") : undefined;
  }
  return undefined;
}

/** Map a single business-like object onto a BusinessCandidate. */
function toCandidate(obj: Record<string, unknown>): BusinessCandidate {
  const candidate: BusinessCandidate = { extra: {} };
  for (const [rawKey, rawVal] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(rawKey)) continue;
    const str = scalarToString(rawVal);
    if (str === undefined) continue;

    let matched = false;
    for (const field of Object.keys(FIELD_ALIASES) as Array<
      keyof Omit<BusinessCandidate, "extra">
    >) {
      if (FIELD_ALIASES[field].test(rawKey) && candidate[field] === undefined) {
        candidate[field] = str;
        matched = true;
        break;
      }
    }
    if (!matched) {
      candidate.extra[rawKey] = str;
    }
  }
  return candidate;
}

/**
 * Recursively walk a parsed JSON value, collecting every business-like object
 * found at any depth into `out`.
 */
function collectBusinesses(value: unknown, out: BusinessCandidate[]): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) collectBusinesses(item, out);
    return;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (looksLikeBusiness(obj)) {
      out.push(toCandidate(obj));
    }
    // Continue walking nested values (e.g. results: [...], data: {...}).
    for (const [k, v] of Object.entries(obj)) {
      if (DANGEROUS_KEYS.has(k)) continue;
      if (v && typeof v === "object") collectBusinesses(v, out);
    }
  }
}

export interface ExtractOptions {
  /** Column names that may contain embedded JSON. */
  jsonColumns?: string[];
}

export interface ExtractedRow {
  /** The original raw row (untouched). */
  source: Record<string, unknown>;
  /** Businesses discovered inside this row's JSON columns. */
  businesses: BusinessCandidate[];
  /** True when at least one JSON column parsed successfully. */
  hadNestedJson: boolean;
}

/**
 * Extract businesses from a single raw row by parsing its JSON columns and
 * recursively surfacing embedded business objects. If the row itself already
 * carries flat business fields (no nested JSON), it is treated as a single
 * candidate so plain CSVs still work.
 */
export function extractRow(
  row: Record<string, unknown>,
  options: ExtractOptions = {}
): ExtractedRow {
  const jsonColumns = options.jsonColumns ?? DEFAULT_JSON_COLUMNS;
  const businesses: BusinessCandidate[] = [];
  let hadNestedJson = false;

  const lowerMap = new Map<string, string>();
  for (const key of Object.keys(row)) lowerMap.set(key.toLowerCase(), key);

  for (const col of jsonColumns) {
    const actualKey = lowerMap.get(col.toLowerCase());
    if (!actualKey) continue;
    const parsed = tryParseJson(row[actualKey]);
    if (parsed === undefined) continue;
    hadNestedJson = true;
    collectBusinesses(parsed, businesses);
  }

  // Fallback: the row itself may be a flat business record (plain CSV lead list).
  if (businesses.length === 0 && looksLikeBusiness(row)) {
    businesses.push(toCandidate(row));
  }

  return { source: row, businesses, hadNestedJson };
}

/**
 * Flatten an array of raw scraper rows (parent job + per-city subtask rows)
 * into a flat list of discovered business candidates. Each business becomes one
 * candidate; scraper task/job rows that yield no business contribute nothing.
 */
export function flattenScraperRows(
  rows: Record<string, unknown>[],
  options: ExtractOptions = {}
): {
  candidates: BusinessCandidate[];
  rowsWithNestedJson: number;
} {
  const candidates: BusinessCandidate[] = [];
  let rowsWithNestedJson = 0;

  for (const row of rows) {
    const extracted = extractRow(row, options);
    if (extracted.hadNestedJson) rowsWithNestedJson += 1;
    for (const biz of extracted.businesses) {
      // Only keep candidates that have at least a name or a website/email.
      if (biz.name || biz.website || biz.email) {
        candidates.push(biz);
      }
    }
  }

  return { candidates, rowsWithNestedJson };
}
