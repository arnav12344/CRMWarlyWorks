/**
 * Verification service: orchestrates providers, aggregation, and persistence.
 *
 * Design guarantees:
 *   - NEVER throws on missing keys or provider/network errors. A missing key
 *     falls back to the offline mock; a failing live call records an "unknown"
 *     result with a reason.
 *   - Persists one EmailVerification row per provider that ran.
 *   - Updates the Contact's consensus summary fields.
 */

import { prisma } from "@/lib/db";
import type { EmailVerifier, VerificationResult } from "./types";
import { MillionVerifier } from "./millionverifier";
import { ZeroBounce } from "./zerobounce";
import { MockVerifier } from "./mock";
import { aggregate, type Consensus } from "./aggregate";
import { loadProviderKeys, type ProviderKeys } from "./settings";

/**
 * How verification runs:
 *   - "live":     at least one real provider key is configured; ONLY real
 *                 providers run (each costs 1 credit per address).
 *   - "mock":     no keys, not production — offline heuristic for dev/demo.
 *   - "disabled": no keys in production — never invent results for real mail.
 */
export type VerificationMode = "live" | "mock" | "disabled";

export function verificationMode(
  keys: ProviderKeys,
  nodeEnv: string | undefined = process.env.NODE_ENV
): VerificationMode {
  if (hasAnyLiveKey(keys)) return "live";
  return nodeEnv === "production" ? "disabled" : "mock";
}

/** Build the verifier set for a mode. Live mode never mixes in mock results. */
export function buildVerifiers(
  keys: ProviderKeys,
  mode: VerificationMode = verificationMode(keys)
): EmailVerifier[] {
  if (mode === "live") {
    const verifiers: EmailVerifier[] = [];
    if (keys.millionverifier) verifiers.push(new MillionVerifier(keys.millionverifier));
    if (keys.zerobounce) verifiers.push(new ZeroBounce(keys.zerobounce));
    return verifiers;
  }
  if (mode === "mock") return [new MockVerifier()];
  return [];
}

/** Credits a run will consume: one per address per live provider. */
export function estimateCredits(addressCount: number, keys: ProviderKeys): number {
  const providers = (keys.millionverifier ? 1 : 0) + (keys.zerobounce ? 1 : 0);
  return Math.max(0, addressCount) * providers;
}

export interface VerifyEmailOutcome {
  email: string;
  results: VerificationResult[];
  consensus: Consensus;
}

/**
 * Verify a single email using the supplied verifiers. Pure orchestration with
 * no DB access, so it is easily unit-tested. Never throws — a verifier that
 * rejects is captured as an "unknown" result.
 */
export async function verifyEmail(
  email: string,
  verifiers: EmailVerifier[]
): Promise<VerifyEmailOutcome> {
  const results = await Promise.all(
    verifiers.map(async (v): Promise<VerificationResult> => {
      try {
        return await v.verify(email);
      } catch (err) {
        return {
          provider: v.name,
          deliverability: "unknown",
          isRole: false,
          isFree: false,
          isDisposable: false,
          isCatchAll: false,
          note:
            err instanceof Error
              ? `${v.name} threw: ${err.message}`
              : `${v.name} failed`,
          raw: { error: String(err) },
        };
      }
    })
  );
  return { email, results, consensus: aggregate(results, email) };
}

/**
 * Verify a contact end-to-end: load keys, run providers (mock fallback),
 * persist EmailVerification rows, update Contact consensus fields, log an
 * Activity. Returns the outcome. Never throws for missing keys / provider
 * errors; a contact with no email is a no-op returning an unknown consensus.
 */
export async function verifyContact(
  contactId: string,
  keysOverride?: ProviderKeys,
  opts: { force?: boolean } = {}
): Promise<VerifyEmailOutcome | null> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return null;
  // Never spend credits re-checking an address that already has a result.
  if (contact.verificationConsensus && !opts.force) return null;

  const email = contact.email?.trim();
  if (!email) {
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        verificationConsensus: "unknown",
        mailboxType: "unknown",
        likelyIndividual: false,
      },
    });
    return {
      email: "",
      results: [],
      consensus: aggregate([], ""),
    };
  }

  const keys = keysOverride ?? (await loadProviderKeys());
  const verifiers = buildVerifiers(keys);
  if (verifiers.length === 0) return null; // disabled (production, no key)
  const outcome = await verifyEmail(email, verifiers);

  // Persist one EmailVerification row per provider result.
  await prisma.$transaction([
    ...outcome.results.map((r) =>
      prisma.emailVerification.create({
        data: {
          contactId,
          email,
          provider: r.provider,
          result: r.deliverability,
          subStatus: r.subStatus ?? r.note ?? null,
          quality: r.quality ?? null,
          isFree: r.isFree,
          isRole: r.isRole,
          isDisposable: r.isDisposable,
          isCatchAll: r.isCatchAll,
          rawJson: JSON.stringify(r.raw ?? null),
        },
      })
    ),
    prisma.contact.update({
      where: { id: contactId },
      data: {
        verificationConsensus: outcome.consensus.verificationConsensus,
        mailboxType: outcome.consensus.mailboxType,
        likelyIndividual: outcome.consensus.likelyIndividual,
      },
    }),
    prisma.activity.create({
      data: {
        contactId,
        type: "verified",
        summary: `Verified ${email}: ${outcome.consensus.deliverability} (${outcome.consensus.mailboxType})`,
        meta: JSON.stringify({
          deliverability: outcome.consensus.deliverability,
          providersRan: outcome.consensus.providersRan,
          providersMocked: outcome.consensus.providersMocked,
          note: outcome.consensus.note,
        }),
      },
    }),
  ]);

  return outcome;
}

/**
 * Verify a small batch of contacts (the UI sends ~10 at a time to stay inside
 * the serverless time limit). Already-verified contacts are skipped.
 */
export async function verifyContacts(
  contactIds: string[]
): Promise<{ verified: number; skipped: number; mode: VerificationMode }> {
  const keys = await loadProviderKeys();
  const mode = verificationMode(keys);
  if (mode === "disabled") return { verified: 0, skipped: contactIds.length, mode };
  // Run a few in parallel; providers handle this fine and it keeps batches fast.
  const results = await Promise.allSettled(contactIds.map((id) => verifyContact(id, keys)));
  const verified = results.filter((r) => r.status === "fulfilled" && r.value).length;
  return { verified, skipped: contactIds.length - verified, mode };
}

/** True when at least one live provider key is configured. */
export function hasAnyLiveKey(keys: ProviderKeys): boolean {
  return Boolean(keys.millionverifier || keys.zerobounce);
}
