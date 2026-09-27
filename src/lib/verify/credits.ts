/**
 * Remaining-credit lookups for the verification providers, so the UI can say
 * "This uses N of your M credits" before spending any.
 *
 *   MillionVerifier: GET https://api.millionverifier.com/api/v3/credits?api=KEY
 *   ZeroBounce:      GET https://api.zerobounce.net/v2/getcredits?api_key=KEY
 *                    -> { "Credits": "1752" }  (-1 means an invalid key)
 */
import type { ProviderKeys } from "./settings";

export interface CreditBalance {
  millionverifier: number | null;
  zerobounce: number | null;
}

/** Pure parsers (unit-tested). Return null when the payload has no usable number. */
export function parseMillionVerifierCredits(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const n = Number(d.credits ?? d.Credits);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseZeroBounceCredits(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const n = Number((data as Record<string, unknown>).Credits);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCredits(keys: ProviderKeys): Promise<CreditBalance> {
  const [mv, zb] = await Promise.all([
    keys.millionverifier
      ? getJson(`https://api.millionverifier.com/api/v3/credits?api=${encodeURIComponent(keys.millionverifier)}`)
      : Promise.resolve(null),
    keys.zerobounce
      ? getJson(`https://api.zerobounce.net/v2/getcredits?api_key=${encodeURIComponent(keys.zerobounce)}`)
      : Promise.resolve(null),
  ]);
  return {
    millionverifier: keys.millionverifier ? parseMillionVerifierCredits(mv) : null,
    zerobounce: keys.zerobounce ? parseZeroBounceCredits(zb) : null,
  };
}
