/**
 * Provider-agnostic email verification contracts.
 *
 * Every verifier (MillionVerifier, ZeroBounce, and the offline mock) maps its
 * own vendor-specific response into a single normalized `VerificationResult`
 * shape so the aggregation layer can cross-check providers without caring which
 * vendor produced a given result.
 */

/** Normalized deliverability classification shared across all providers. */
export type Deliverability =
  | "valid"
  | "invalid"
  | "catch_all"
  | "disposable"
  | "role"
  | "unknown";

/** Which provider produced a result. Matches EmailVerification.provider. */
export type ProviderName =
  | "millionverifier"
  | "zerobounce"
  | "manual"
  | "mock";

/**
 * A normalized verification result. `raw` holds the original vendor payload (or
 * a description of why a live check could not run) so nothing is lost.
 */
export interface VerificationResult {
  provider: ProviderName;
  /** Normalized deliverability classification. */
  deliverability: Deliverability;
  /** Role / shared mailbox (info@, admissions@, ...) per the provider. */
  isRole: boolean;
  /** Free mailbox provider (gmail, yahoo, ...). */
  isFree: boolean;
  /** Disposable / throwaway address. */
  isDisposable: boolean;
  /** Domain accepts all mail (catch-all). */
  isCatchAll: boolean;
  /** Optional provider quality/confidence descriptor (e.g. "good", "high"). */
  quality?: string;
  /** Vendor sub-status / reason code, when present. */
  subStatus?: string;
  /**
   * True when this result came from the offline mock verifier rather than a
   * live provider call (missing key or network error). Used by the queue UI to
   * show "mock mode".
   */
  mocked?: boolean;
  /** Human-readable note explaining a fallback / error, when relevant. */
  note?: string;
  /** The original provider payload (already JSON-safe). */
  raw: unknown;
}

/** A single email verifier behind the provider-agnostic interface. */
export interface EmailVerifier {
  /** Provider identity, persisted on EmailVerification.provider. */
  readonly name: ProviderName;
  /** Verify a single email address, never throwing. */
  verify(email: string): Promise<VerificationResult>;
}
