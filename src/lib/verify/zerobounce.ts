/**
 * ZeroBounce provider.
 *
 * API: GET https://api.zerobounce.net/v2/validate?api_key=KEY&email=EMAIL
 * Sample response fields we map:
 *   { address, status: "valid"|"invalid"|"catch-all"|"spamtrap"|"abuse"
 *       |"do_not_mail"|"unknown", sub_status, free_email: bool, ... }
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

export const ZEROBOUNCE_ENDPOINT = "https://api.zerobounce.net/v2/validate";

/** Shape of the fields we consume from a ZeroBounce response. */
export interface ZeroBounceResponse {
  address?: string;
  status?: string; // valid | invalid | catch-all | spamtrap | abuse | do_not_mail | unknown
  sub_status?: string;
  free_email?: boolean;
  mx_found?: boolean | string;
  [key: string]: unknown;
}

/** Sub-statuses that indicate a disposable / toxic address. */
const DISPOSABLE_SUBSTATUS = new Set([
  "disposable",
  "toxic",
]);

/** Sub-statuses that indicate a role-based address. */
const ROLE_SUBSTATUS = new Set([
  "role_based",
  "role_based_catch_all",
  "global_suppression",
]);

function mapStatus(status: string | undefined): Deliverability {
  switch ((status ?? "").toLowerCase()) {
    case "valid":
      return "valid";
    case "invalid":
    case "spamtrap":
    case "abuse":
    case "do_not_mail":
      return "invalid";
    case "catch-all":
    case "catch_all":
    case "catchall":
      return "catch_all";
    default:
      return "unknown";
  }
}

/** Pure mapper: ZeroBounce JSON -> normalized VerificationResult. */
export function mapZeroBounce(
  data: ZeroBounceResponse,
  email: string
): VerificationResult {
  const status = mapStatus(data.status);
  const sub = (data.sub_status ?? "").toLowerCase();
  const isDisposable = DISPOSABLE_SUBSTATUS.has(sub);
  const isRole =
    ROLE_SUBSTATUS.has(sub) || isRoleLocalPart(data.address ?? email);
  const isCatchAll = status === "catch_all";

  let deliverability: Deliverability = status;
  if (isDisposable) deliverability = "disposable";
  else if (deliverability === "valid" && isRole) deliverability = "role";

  return {
    provider: "zerobounce",
    deliverability,
    isRole,
    isFree: data.free_email === true,
    isDisposable,
    isCatchAll,
    quality: typeof data.status === "string" ? data.status : undefined,
    subStatus: typeof data.sub_status === "string" ? data.sub_status : undefined,
    raw: data,
  };
}

export class ZeroBounce implements EmailVerifier {
  readonly name = "zerobounce" as const;

  constructor(private readonly apiKey: string) {}

  async verify(email: string): Promise<VerificationResult> {
    const url = `${ZEROBOUNCE_ENDPOINT}?api_key=${encodeURIComponent(
      this.apiKey
    )}&email=${encodeURIComponent(email)}`;
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        return unknownResult(email, `HTTP ${res.status} from ZeroBounce`);
      }
      const data = (await res.json()) as ZeroBounceResponse;
      return mapZeroBounce(data, email);
    } catch (err) {
      return unknownResult(
        email,
        err instanceof Error ? err.message : "ZeroBounce request failed"
      );
    }
  }
}

function unknownResult(email: string, note: string): VerificationResult {
  return {
    provider: "zerobounce",
    deliverability: "unknown",
    isRole: isRoleLocalPart(email),
    isFree: false,
    isDisposable: false,
    isCatchAll: false,
    note,
    raw: { error: note },
  };
}
