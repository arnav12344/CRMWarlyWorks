import { describe, it, expect, vi, afterEach } from "vitest";
import { buildVerifiers, verifyEmail, verificationMode, estimateCredits } from "../service";
import { MockVerifier } from "../mock";
import { MillionVerifier } from "../millionverifier";
import { ZeroBounce } from "../zerobounce";
import { parseMillionVerifierCredits, parseZeroBounceCredits } from "../credits";
import type { ProviderKeys } from "../settings";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const NONE: ProviderKeys = { millionverifier: null, zerobounce: null };

describe("verificationMode", () => {
  it("is live whenever a real key exists", () => {
    expect(verificationMode({ millionverifier: "k", zerobounce: null }, "production")).toBe("live");
  });
  it("is DISABLED in production without keys (never invent results)", () => {
    expect(verificationMode(NONE, "production")).toBe("disabled");
    expect(buildVerifiers(NONE, "disabled")).toEqual([]);
  });
  it("uses the offline mock in dev/test without keys", () => {
    expect(verificationMode(NONE, "development")).toBe("mock");
    expect(verificationMode(NONE, "test")).toBe("mock");
  });
});

describe("buildVerifiers", () => {
  it("live mode uses ONLY the providers with keys (no mock mixed in)", () => {
    const v = buildVerifiers({ millionverifier: "mv", zerobounce: null }, "live");
    expect(v).toHaveLength(1);
    expect(v[0]).toBeInstanceOf(MillionVerifier);
  });
  it("uses both live providers when both keys present", () => {
    const v = buildVerifiers({ millionverifier: "mv", zerobounce: "zb" }, "live");
    expect(v[0]).toBeInstanceOf(MillionVerifier);
    expect(v[1]).toBeInstanceOf(ZeroBounce);
  });
  it("mock mode uses a single mock", () => {
    const v = buildVerifiers(NONE, "mock");
    expect(v).toHaveLength(1);
    expect(v[0]).toBeInstanceOf(MockVerifier);
  });
});

describe("credits", () => {
  it("estimateCredits = addresses x live providers", () => {
    expect(estimateCredits(40, { millionverifier: "a", zerobounce: null })).toBe(40);
    expect(estimateCredits(40, { millionverifier: "a", zerobounce: "b" })).toBe(80);
    expect(estimateCredits(40, NONE)).toBe(0);
  });
  it("parses provider credit payloads", () => {
    expect(parseZeroBounceCredits({ Credits: "92" })).toBe(92);
    expect(parseZeroBounceCredits({ Credits: "-1" })).toBeNull();
    expect(parseMillionVerifierCredits({ credits: 100 })).toBe(100);
    expect(parseMillionVerifierCredits(null)).toBeNull();
  });
});

describe("verifyEmail graceful degradation", () => {
  it("mock classifies role / disposable addresses", async () => {
    const mock = buildVerifiers(NONE, "mock");
    expect((await verifyEmail("info@company.com", mock)).consensus.mailboxType).toBe("role");
    expect((await verifyEmail("x@mailinator.com", mock)).consensus.deliverability).toBe("disposable");
  });

  it("does NOT throw when a live provider network call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const outcome = await verifyEmail("jane@company.com", buildVerifiers({ millionverifier: "k", zerobounce: null }, "live"));
    expect(outcome.results[0].deliverability).toBe("unknown");
    expect(outcome.results[0].note).toBeTruthy();
  });

  it("maps a live MillionVerifier ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: "ok", quality: "good", free: false, role: false }) })
    );
    const outcome = await verifyEmail("jane@company.com", buildVerifiers({ millionverifier: "k", zerobounce: null }, "live"));
    expect(outcome.consensus.deliverability).toBe("valid");
    expect(outcome.consensus.providersMocked).toEqual([]);
  });
});

describe("MockVerifier is deterministic and offline", () => {
  it("produces the same result for the same email", async () => {
    const v = new MockVerifier();
    expect((await v.verify("jane@company.com")).deliverability).toBe((await v.verify("jane@company.com")).deliverability);
  });
  it("flags malformed addresses as invalid", async () => {
    expect((await new MockVerifier().verify("not-an-email")).deliverability).toBe("invalid");
  });
});
