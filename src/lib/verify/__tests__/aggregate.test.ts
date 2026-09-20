import { describe, it, expect } from "vitest";
import { aggregate } from "../aggregate";
import type { VerificationResult } from "../types";

function result(
  provider: VerificationResult["provider"],
  over: Partial<VerificationResult>
): VerificationResult {
  return {
    provider,
    deliverability: "unknown",
    isRole: false,
    isFree: false,
    isDisposable: false,
    isCatchAll: false,
    raw: {},
    ...over,
  };
}

describe("aggregate() consensus precedence", () => {
  it("both providers valid => valid, individual, likelyIndividual=true", () => {
    const c = aggregate(
      [
        result("millionverifier", { deliverability: "valid" }),
        result("zerobounce", { deliverability: "valid" }),
      ],
      "jane.doe@company.com"
    );
    expect(c.deliverability).toBe("valid");
    expect(c.verificationConsensus).toBe("valid");
    expect(c.mailboxType).toBe("individual");
    expect(c.likelyIndividual).toBe(true);
  });

  it("any invalid => invalid regardless of the other provider", () => {
    const c = aggregate(
      [
        result("millionverifier", { deliverability: "valid" }),
        result("zerobounce", { deliverability: "invalid" }),
      ],
      "jane.doe@company.com"
    );
    expect(c.deliverability).toBe("invalid");
    expect(c.verificationConsensus).toBe("invalid");
    expect(c.likelyIndividual).toBe(false);
  });

  it("catch-all disagreement => catch_all / risky, not individual", () => {
    const c = aggregate(
      [
        result("millionverifier", { deliverability: "valid" }),
        result("zerobounce", { deliverability: "catch_all", isCatchAll: true }),
      ],
      "jane.doe@company.com"
    );
    expect(c.deliverability).toBe("catch_all");
    expect(c.verificationConsensus).toBe("risky");
    expect(c.mailboxType).toBe("catchall");
    expect(c.likelyIndividual).toBe(false);
  });

  it("role detection => likelyIndividual=false (provider role flag)", () => {
    const c = aggregate(
      [
        result("millionverifier", { deliverability: "valid", isRole: true }),
        result("zerobounce", { deliverability: "valid", isRole: true }),
      ],
      "somebody@company.com"
    );
    expect(c.mailboxType).toBe("role");
    expect(c.likelyIndividual).toBe(false);
    expect(c.deliverability).toBe("role");
  });

  it("role detection via local-part pattern => likelyIndividual=false", () => {
    const c = aggregate(
      [
        result("millionverifier", { deliverability: "valid" }),
        result("zerobounce", { deliverability: "valid" }),
      ],
      "info@company.com"
    );
    expect(c.mailboxType).toBe("role");
    expect(c.likelyIndividual).toBe(false);
  });

  it("disposable => invalid bucket, disposable mailbox type", () => {
    const c = aggregate(
      [result("mock", { deliverability: "disposable", isDisposable: true, mocked: true })],
      "throwaway@mailinator.com"
    );
    expect(c.deliverability).toBe("disposable");
    expect(c.verificationConsensus).toBe("invalid");
    expect(c.mailboxType).toBe("disposable");
    expect(c.likelyIndividual).toBe(false);
  });

  it("disagreement (valid vs unknown) => unknown with a note", () => {
    const c = aggregate(
      [
        result("millionverifier", { deliverability: "valid" }),
        result("zerobounce", { deliverability: "unknown" }),
      ],
      "jane@company.com"
    );
    // valid + unknown: contributing providers all valid => valid.
    expect(c.deliverability).toBe("valid");
    // but if both unknown:
    const c2 = aggregate(
      [
        result("millionverifier", { deliverability: "unknown" }),
        result("zerobounce", { deliverability: "unknown" }),
      ],
      "jane@company.com"
    );
    expect(c2.deliverability).toBe("unknown");
    expect(c2.note).toMatch(/unknown|determine/i);
  });

  it("empty results => unknown, not individual", () => {
    const c = aggregate([], "");
    expect(c.deliverability).toBe("unknown");
    expect(c.likelyIndividual).toBe(false);
  });

  it("reports which providers ran vs were mocked", () => {
    const c = aggregate(
      [
        result("millionverifier", { deliverability: "valid" }),
        result("mock", { deliverability: "valid", mocked: true }),
      ],
      "jane@company.com"
    );
    expect(c.providersRan).toContain("millionverifier");
    expect(c.providersMocked).toContain("mock");
  });
});
