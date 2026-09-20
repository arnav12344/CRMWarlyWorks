/**
 * Secret redaction for imported data.
 *
 * The user's scraper exports have been observed to contain exposed API keys,
 * bearer tokens, and passwords buried inside nested JSON columns. NONE of these
 * values may ever be persisted to Organization / Contact / ImportRow.raw.
 *
 * This module walks arbitrary JSON-like structures (objects, arrays, scalars)
 * and replaces any secret-like field with REDACTED_PLACEHOLDER, counting how
 * many replacements were made. Detection is by key name AND by value shape so
 * that a long token-like value with an innocuous key is still caught.
 *
 * Security note (see FEAT-001 findings): xlsx/SheetJS has a prototype-pollution
 * advisory. We NEVER merge parsed objects onto existing prototypes — we build
 * fresh plain objects and skip the dangerous keys __proto__/constructor/prototype.
 */

export const REDACTED_PLACEHOLDER = "[REDACTED]";

/** Keys whose values are always treated as secrets, regardless of value shape. */
export const SECRET_KEY_REGEX =
  /api[_-]?key|token|secret|password|passwd|bearer|authorization|auth[_-]?token|access[_-]?key|client[_-]?secret|private[_-]?key/i;

/** Dangerous keys that must never be copied when rebuilding plain objects. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * A value looks like a secret token when it is a long, high-entropy-ish string
 * with no spaces: e.g. "sk_live_5f8d...", "ghp_abc123...", a JWT, or a long hex
 * blob. We keep this conservative to avoid redacting ordinary business text
 * (which normally contains spaces or is short).
 */
export function looksLikeTokenValue(value: string): boolean {
  const v = value.trim();
  if (v.length < 20) return false;
  if (/\s/.test(v)) return false; // real prose / addresses have spaces

  // Common secret prefixes (Stripe, GitHub, Slack, OpenAI, AWS, Google, etc.).
  if (/^(sk|pk|rk)_(live|test)_[a-z0-9]/i.test(v)) return true;
  if (/^(gh[posru]|xox[baprs]|sk-|AKIA|ASIA|AIza|ya29\.)/.test(v)) return true;

  // JWT: three base64url segments separated by dots.
  if (/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(v)) {
    return true;
  }

  // Long opaque token: mostly base64/hex characters, decent length, and a mix
  // of letters + digits (URLs, emails and domains are excluded because they
  // contain '@', '/', ':' or lack the digit/length profile).
  if (/[@/:]/.test(v)) return false;
  if (v.length >= 32 && /^[A-Za-z0-9+/=._-]+$/.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v)) {
    return true;
  }

  return false;
}

/**
 * A string may itself be a JSON blob (the scraper stuffs `data`/`metadata`/
 * `error` columns with stringified JSON that hides secrets inside). We only
 * treat it as JSON when it clearly starts as an object/array to avoid parsing
 * ordinary prose.
 */
function tryParseJsonString(value: string): unknown | undefined {
  const trimmed = value.trim();
  if (!/^[[{]/.test(trimmed)) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

export interface RedactionResult<T = unknown> {
  /** A brand-new value with every secret replaced by REDACTED_PLACEHOLDER. */
  value: T;
  /** How many individual secret values were redacted. */
  redactedCount: number;
}

/**
 * Recursively redact secrets from any JSON-like value. Returns a fresh copy;
 * the input is never mutated. Objects are rebuilt as plain objects (guarding
 * against prototype pollution from untrusted parsed JSON).
 */
export function redactSecrets<T>(input: T): RedactionResult<T> {
  let count = 0;

  function walk(value: unknown, keyIsSecret: boolean): unknown {
    // If the enclosing key is a secret key, redact whatever it holds outright
    // (string, number, nested object — the whole thing goes).
    if (keyIsSecret) {
      count += 1;
      return REDACTED_PLACEHOLDER;
    }

    if (value === null || value === undefined) return value;

    if (typeof value === "string") {
      if (looksLikeTokenValue(value)) {
        count += 1;
        return REDACTED_PLACEHOLDER;
      }
      // The string may itself be a JSON blob hiding secrets (scraper columns
      // like `data`/`metadata`/`error`). Redact inside and re-stringify so the
      // secret never survives, even in the persisted raw provenance row.
      const parsed = tryParseJsonString(value);
      if (parsed !== undefined) {
        const cleaned = walk(parsed, false);
        return JSON.stringify(cleaned);
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => walk(item, false));
    }

    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (DANGEROUS_KEYS.has(k)) continue;
        const secretKey = SECRET_KEY_REGEX.test(k);
        out[k] = walk(v, secretKey);
      }
      return out;
    }

    // number / boolean — safe as-is.
    return value;
  }

  const value = walk(input, false) as T;
  return { value, redactedCount: count };
}

/**
 * Convenience guard: throws if any secret-like value survives in the given
 * structure. Used as a defensive assertion before persisting.
 */
export function assertNoSecrets(input: unknown): void {
  const { redactedCount } = redactSecrets(input);
  if (redactedCount > 0) {
    throw new Error(
      `Refusing to persist: ${redactedCount} secret-like value(s) still present after redaction.`
    );
  }
}
