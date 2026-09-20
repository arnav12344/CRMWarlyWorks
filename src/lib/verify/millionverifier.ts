/**
 * MillionVerifier provider.
 *
 * API: GET https://api.millionverifier.com/api/v3/?api=KEY&email=EMAIL
 * Sample response fields we map:
 *   { email, result: "ok"|"invalid"|"catch_all"|"unknown"|"disposable",
 *     quality, free: bool, role: bool, ... }
 *
 * The mapper is a PURE function exported separately so it can be unit-tested on
 * sample JSON without any network access.
 */

import type {
  EmailVerifier,
  VerificationResult,
  Deliverability,
} from "./types";
import { isRoleLocalPart } from "./heuristics";

export const MILLIONVERIFIER_ENDPOINT =
  "https://api.millionverifier.com/api/v3/";

/** Shape of the fields we consume from a MillionVerifier response. */
export interface MillionVerifierResponse {
  email?: string;
  result?: string; // ok | invalid | catch_all | unknown | disposable
  quality?: string;
  free?: boolean;
  role?: boolean;
  disposable?: boolean;
  [key: string]: unknown;
}

function mapResult(result: string | undefined): Deliverability {
  switch ((result ?? "").toLowerCase()) {
    case "ok":
      return "valid";
    case "invalid":
      return "invalid";
    case "catch_all":
    case "catchall":
      return "catch_all";
    case "disposable":
      return "disposable";
    default:
      return "unknown";
  }
}

/** Pure mapper: MillionVerifier JSON -> normalized VerificationResult. */
export function mapMillionVerifier(
  data: MillionVerifierResponse,
  email: string
): VerificationResult {
  const deliverability = mapResult(data.result);
  const isDisposable = deliverability === "disposable" || data.disposable === true;
  const isCatchAll = deliverability === "catch_all";
  const isRole = data.role === true || isRoleLocalPart(email);
  return {
    provider: "millionverifier",
    // A role mailbox still deliverable: surface "role" when the address is a
    // role inbox but the domain itself is deliverable.
    deliverability:
      deliverability === "valid" && isRole ? "role" : deliverability,
    isRole,
    isFree: data.free === true,
    isDisposable,
    isCatchAll,
    quality: typeof data.quality === "string" ? data.quality : undefined,
    subStatus: typeof data.result === "string" ? data.result : undefined,
    raw: data,
  };
}

export class MillionVerifier implements EmailVerifier {
  readonly name = "millionverifier" as const;

  constructor(private readonly apiKey: string) {}

  async verify(email: string): Promise<VerificationResult> {
    const url = `${MILLIONVERIFIER_ENDPOINT}?api=${encodeURIComponent(
      this.apiKey
    )}&email=${encodeURIComponent(email)}`;
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        return unknownResult(email, `HTTP ${res.status} from MillionVerifier`);
      }
      const data = (await res.json()) as MillionVerifierResponse;
      return mapMillionVerifier(data, email);
    } catch (err) {
      return unknownResult(
        email,
        err instanceof Error ? err.message : "MillionVerifier request failed"
      );
    }
  }
}

function unknownResult(email: string, note: string): VerificationResult {
  return {
    provider: "millionverifier",
    deliverability: "unknown",
    isRole: isRoleLocalPart(email),
    isFree: false,
    isDisposable: false,
    isCatchAll: false,
    note,
    raw: { error: note },
  };
}
