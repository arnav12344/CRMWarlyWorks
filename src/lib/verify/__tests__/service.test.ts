import { describe, it, expect, vi, afterEach } from "vitest";
import { buildVerifiers, verifyEmail } from "../service";
import { MockVerifier } from "../mock";
import { MillionVerifier } from "../millionverifier";
import { ZeroBounce } from "../zerobounce";
import type { ProviderKeys } from "../settings";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildVerifiers key fallback", () => {
  it("falls back to mock for BOTH providers when no keys are configured", () => {
    const keys: ProviderKeys = { millionverifier: null, zerobounce: null };
    const verifiers = buildVerifiers(keys);
    expect(verifiers).toHaveLength(2);
    expect(verifiers.every((v) => v instanceof MockVerifier)).toBe(true);
  });

  it("uses the live provider when its key is present, mock otherwise", () => {
    const keys: ProviderKeys = { millionverifier: "mv-key", zerobounce: null };
    const verifiers = buildVerifiers(keys);
    expect(verifiers[0]).toBeInstanceOf(MillionVerifier);
    expect(verifiers[1]).toBeInstanceOf(MockVerifier);
  });

  it("uses both live providers when both keys present", () => {
    const keys: ProviderKeys = { millionverifier: "mv", zerobounce: "zb" };
    const verifiers = buildVerifiers(keys);
    expect(verifiers[0]).toBeInstanceOf(MillionVerifier);
    expect(verifiers[1]).toBeInstanceOf(ZeroBounce);
  });
});

describe("verifyEmail graceful degradation", () => {
  it("returns mock results without throwing when keys are absent", async () => {
    const verifiers = buildVerifiers({ millionverifier: null, zerobounce: null });
    const outcome = await verifyEmail("jane.doe@company.com", verifiers);
    expect(outcome.results).toHaveLength(2);
    expect(outcome.results.every((r) => r.mocked)).toBe(true);
    expect(outcome.consensus.providersMocked.length).toBe(2);
    expect(outcome.consensus.deliverability).toBeDefined();
  });

  it("mock classifies a role inbox as role, not individual", async () => {
    const outcome = await verifyEmail("info@company.com", buildVerifiers({
      millionverifier: null,
      zerobounce: null,
    }));
    expect(outcome.consensus.mailboxType).toBe("role");
    expect(outcome.consensus.likelyIndividual).toBe(false);
  });

  it("mock classifies a disposable domain as disposable", async () => {
    const outcome = await verifyEmail("x@mailinator.com", buildVerifiers({
      millionverifier: null,
      zerobounce: null,
    }));
    expect(outcome.consensus.deliverability).toBe("disposable");
  });

  it("does NOT throw when a live provider network call fails", async () => {
    // Simulate a failing fetch for the live provider.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    const verifiers = buildVerifiers({ millionverifier: "mv-key", zerobounce: null });
    const outcome = await verifyEmail("jane@company.com", verifiers);
    expect(outcome.results).toHaveLength(2);
    // Live provider degraded to "unknown" with a note, mock still ran.
    const mv = outcome.results.find((r) => r.provider === "millionverifier");
    expect(mv?.deliverability).toBe("unknown");
    expect(mv?.note).toBeTruthy();
  });

  it("maps a live MillionVerifier ok response through fetch mock", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: "ok", quality: "good", free: false, role: false }),
      })
    );
    const verifiers = buildVerifiers({ millionverifier: "mv-key", zerobounce: null });
    const outcome = await verifyEmail("jane@company.com", verifiers);
    const mv = outcome.results.find((r) => r.provider === "millionverifier");
    expect(mv?.deliverability).toBe("valid");
  });
});

describe("MockVerifier is deterministic and offline", () => {
  it("produces the same result for the same email", async () => {
    const v = new MockVerifier();
    const a = await v.verify("jane@company.com");
    const b = await v.verify("jane@company.com");
    expect(a.deliverability).toBe(b.deliverability);
    expect(a.mocked).toBe(true);
  });

  it("flags malformed addresses as invalid", async () => {
    const v = new MockVerifier();
    const r = await v.verify("not-an-email");
    expect(r.deliverability).toBe("invalid");
  });
});
