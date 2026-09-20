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
 * Build the verifier set from provider keys. When a key is missing, that
 * provider is represented by the offline mock (tagged with the mock provider),
 * so the aggregation still gets two data points and never crashes.
 */
export function buildVerifiers(keys: ProviderKeys): EmailVerifier[] {
  const verifiers: EmailVerifier[] = [];
  verifiers.push(
    keys.millionverifier
      ? new MillionVerifier(keys.millionverifier)
      : new MockVerifier()
  );
  verifiers.push(
    keys.zerobounce ? new ZeroBounce(keys.zerobounce) : new MockVerifier()
  );
  return verifiers;
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
  keysOverride?: ProviderKeys
): Promise<VerifyEmailOutcome | null> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return null;

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

/** Verify many contacts sequentially. Never throws for individual failures. */
export async function verifyContacts(
  contactIds: string[]
): Promise<{ verified: number; skipped: number }> {
  const keys = await loadProviderKeys();
  let verified = 0;
  let skipped = 0;
  for (const id of contactIds) {
    try {
      const outcome = await verifyContact(id, keys);
      if (outcome) verified += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { verified, skipped };
}

/** True when at least one live provider key is configured. */
export function hasAnyLiveKey(keys: ProviderKeys): boolean {
  return Boolean(keys.millionverifier || keys.zerobounce);
}
