/**
 * Consensus / aggregation layer.
 *
 * Given the normalized results of one or more providers (real or mock), compute
 * a single consensus classification for a contact:
 *   - overall deliverability (with documented precedence),
 *   - mailboxType (individual | role | catchall | disposable | unknown),
 *   - likelyIndividual flag,
 *   - a human-readable note and which providers ran vs were mocked.
 *
 * DOCUMENTED PRECEDENCE for overall deliverability (evaluated in order):
 *   1. If ANY provider says `invalid`        => "invalid".
 *   2. If ANY provider says `disposable`     => "disposable".
 *   3. If ALL contributing providers agree on `valid` => "valid".
 *   4. If ANY provider says `catch_all` (and none invalid/disposable)
 *                                            => "catch_all".
 *   5. If providers DISAGREE (e.g. one valid, one unknown) or all unknown
 *                                            => "unknown" (with a note).
 *   6. If every provider returned `role`     => "role".
 *
 * likelyIndividual is FALSE when the mailbox is a role inbox (role local-part
 * pattern OR any provider reported role=true), a catch-all, disposable, or
 * invalid. It is TRUE only for a named individual mailbox that is valid/unknown
 * and not flagged role.
 */

import type { VerificationResult, Deliverability, ProviderName } from "./types";
import { isRoleLocalPart } from "./heuristics";

export type MailboxType =
  | "individual"
  | "role"
  | "catchall"
  | "disposable"
  | "unknown";

export interface Consensus {
  /** Overall normalized deliverability after applying precedence rules. */
  deliverability: Deliverability;
  /** Coarse verification result stored on Contact.verificationConsensus. */
  verificationConsensus: "valid" | "invalid" | "risky" | "unknown";
  mailboxType: MailboxType;
  likelyIndividual: boolean;
  /** Human-readable explanation of how consensus was reached. */
  note: string;
  /** Providers that produced a live (non-mock) result. */
  providersRan: ProviderName[];
  /** Providers whose result came from the offline mock. */
  providersMocked: ProviderName[];
}

function has(results: VerificationResult[], d: Deliverability): boolean {
  return results.some((r) => r.deliverability === d);
}

function toConsensusBucket(
  d: Deliverability
): "valid" | "invalid" | "risky" | "unknown" {
  switch (d) {
    case "valid":
      return "valid";
    case "invalid":
    case "disposable":
      return "invalid";
    case "catch_all":
    case "role":
      return "risky";
    default:
      return "unknown";
  }
}

/**
 * Aggregate provider results into a single consensus.
 *
 * @param results  One result per provider (mock or live). May be empty.
 * @param email    The address being verified (used for role-pattern fallback).
 */
export function aggregate(
  results: VerificationResult[],
  email: string
): Consensus {
  const providersRan = results
    .filter((r) => !r.mocked)
    .map((r) => r.provider);
  const providersMocked = results
    .filter((r) => r.mocked)
    .map((r) => r.provider);

  if (results.length === 0) {
    return {
      deliverability: "unknown",
      verificationConsensus: "unknown",
      mailboxType: "unknown",
      likelyIndividual: false,
      note: "No verification results available.",
      providersRan,
      providersMocked,
    };
  }

  // Role detection: local-part pattern OR any provider flagged role=true.
  const roleFlagged = isRoleLocalPart(email) || results.some((r) => r.isRole);
  const anyCatchAll = has(results, "catch_all") || results.some((r) => r.isCatchAll);
  const anyDisposable =
    has(results, "disposable") || results.some((r) => r.isDisposable);

  // --- Overall deliverability precedence ---
  let deliverability: Deliverability;
  let note: string;

  const contributing = results.filter((r) => r.deliverability !== "unknown");

  if (has(results, "invalid")) {
    deliverability = "invalid";
    note = "At least one provider reported the address as invalid.";
  } else if (anyDisposable) {
    deliverability = "disposable";
    note = "Address is on a disposable / throwaway domain.";
  } else if (
    contributing.length > 0 &&
    contributing.every((r) => r.deliverability === "valid" || r.deliverability === "role")
  ) {
    // All providers that had an opinion agree the mailbox is reachable.
    deliverability = roleFlagged ? "role" : "valid";
    note = roleFlagged
      ? "Providers agree the domain is deliverable; address is a role inbox."
      : "All contributing providers agree the address is valid.";
  } else if (anyCatchAll) {
    deliverability = "catch_all";
    note =
      "Domain appears to be catch-all; individual mailbox cannot be confirmed.";
  } else {
    deliverability = "unknown";
    note =
      contributing.length === 0
        ? "No provider could determine deliverability."
        : "Providers disagreed; treating as unknown pending manual review.";
  }

  // --- Mailbox type ---
  let mailboxType: MailboxType;
  if (deliverability === "disposable") mailboxType = "disposable";
  else if (deliverability === "catch_all" || anyCatchAll) mailboxType = "catchall";
  else if (roleFlagged) mailboxType = "role";
  else if (deliverability === "valid") mailboxType = "individual";
  else mailboxType = "unknown";

  // --- likelyIndividual ---
  const likelyIndividual =
    !roleFlagged &&
    !anyCatchAll &&
    !anyDisposable &&
    deliverability !== "invalid" &&
    (deliverability === "valid" || mailboxType === "individual");

  return {
    deliverability,
    verificationConsensus: toConsensusBucket(deliverability),
    mailboxType,
    likelyIndividual,
    note,
    providersRan,
    providersMocked,
  };
}
