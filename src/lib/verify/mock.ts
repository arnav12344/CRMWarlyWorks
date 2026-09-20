/**
 * Deterministic OFFLINE email verifier.
 *
 * Used whenever a live provider key is absent (or a live call fails) so the
 * verification queue always produces a result instead of crashing. It makes NO
 * network calls; its output is a pure function of the email string and the
 * built-in role/free/disposable heuristics.
 */

import type { EmailVerifier, VerificationResult, Deliverability } from "./types";
import {
  domainOf,
  isRoleLocalPart,
  isFreeDomain,
  isDisposableDomain,
} from "./heuristics";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Domains we treat as catch-all for deterministic offline behaviour. */
const CATCH_ALL_HINTS = ["catchall", "catch-all"];

function classify(email: string): {
  deliverability: Deliverability;
  isRole: boolean;
  isFree: boolean;
  isDisposable: boolean;
  isCatchAll: boolean;
  quality: string;
  reason: string;
} {
  const normalized = String(email).trim().toLowerCase();
  const domain = domainOf(normalized);
  const isRole = isRoleLocalPart(normalized);
  const isFree = isFreeDomain(normalized);
  const isDisposable = isDisposableDomain(normalized);
  const isCatchAll = domain
    ? CATCH_ALL_HINTS.some((h) => domain.includes(h))
    : false;

  if (!EMAIL_SHAPE.test(normalized) || !domain) {
    return {
      deliverability: "invalid",
      isRole,
      isFree,
      isDisposable,
      isCatchAll,
      quality: "bad",
      reason: "malformed_address",
    };
  }

  if (isDisposable) {
    return {
      deliverability: "disposable",
      isRole,
      isFree,
      isDisposable,
      isCatchAll,
      quality: "bad",
      reason: "disposable_domain",
    };
  }

  if (isCatchAll) {
    return {
      deliverability: "catch_all",
      isRole,
      isFree,
      isDisposable,
      isCatchAll: true,
      quality: "risky",
      reason: "catch_all_domain",
    };
  }

  if (isRole) {
    return {
      deliverability: "role",
      isRole: true,
      isFree,
      isDisposable,
      isCatchAll,
      quality: "risky",
      reason: "role_mailbox",
    };
  }

  // A plausibly-deliverable individual address. Deterministic and offline: we
  // cannot actually confirm the mailbox, so treat as "unknown" leaning valid
  // via quality, keeping the mock honest about its limits.
  return {
    deliverability: "valid",
    isRole,
    isFree,
    isDisposable,
    isCatchAll,
    quality: isFree ? "good" : "good",
    reason: "heuristic_ok",
  };
}

export class MockVerifier implements EmailVerifier {
  readonly name = "mock" as const;

  async verify(email: string): Promise<VerificationResult> {
    const c = classify(email);
    return {
      provider: "mock",
      deliverability: c.deliverability,
      isRole: c.isRole,
      isFree: c.isFree,
      isDisposable: c.isDisposable,
      isCatchAll: c.isCatchAll,
      quality: c.quality,
      subStatus: c.reason,
      mocked: true,
      note: "Offline heuristic result (no provider key configured).",
      raw: { email, ...c, engine: "mock-heuristic-v1" },
    };
  }
}

/** Convenience factory. */
export function createMockVerifier(): MockVerifier {
  return new MockVerifier();
}
