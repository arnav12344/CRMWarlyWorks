import { describe, it, expect } from "vitest";
import {
  redactSecrets,
  looksLikeTokenValue,
  REDACTED_PLACEHOLDER,
} from "../redactSecrets";
import { FAKE_API_KEY } from "./fixtures";

describe("redactSecrets", () => {
  it("redacts secret-like keys in a flat object and counts them", () => {
    const { value, redactedCount } = redactSecrets({
      name: "Acme",
      api_key: FAKE_API_KEY,
      password: "hunter2hunter2hunter2",
      email: "info@acme.com",
    });
    expect(redactedCount).toBe(2);
    expect((value as Record<string, unknown>).api_key).toBe(REDACTED_PLACEHOLDER);
    expect((value as Record<string, unknown>).password).toBe(REDACTED_PLACEHOLDER);
    expect((value as Record<string, unknown>).email).toBe("info@acme.com");
    expect((value as Record<string, unknown>).name).toBe("Acme");
  });

  it("redacts secrets nested inside objects and arrays", () => {
    const input = {
      results: [
        { name: "Biz", credentials: { apiKey: FAKE_API_KEY } },
        { name: "Biz2", tokens: [{ bearer: "xyz" }] },
      ],
      meta: { authorization: "Bearer somethinglong0000" },
    };
    const { value, redactedCount } = redactSecrets(input);
    expect(redactedCount).toBe(3);
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain(FAKE_API_KEY);
    expect(serialized).toContain(REDACTED_PLACEHOLDER);
  });

  it("does not mutate the input", () => {
    const input = { api_key: FAKE_API_KEY };
    redactSecrets(input);
    expect(input.api_key).toBe(FAKE_API_KEY);
  });

  it("keeps ordinary business text with spaces intact", () => {
    const { value, redactedCount } = redactSecrets({
      address: "1 Orchard Road, Singapore 238888",
      name: "Bright Future Learning",
    });
    expect(redactedCount).toBe(0);
    expect((value as Record<string, unknown>).address).toBe(
      "1 Orchard Road, Singapore 238888"
    );
  });

  it("strips prototype-polluting keys when rebuilding objects", () => {
    const malicious = JSON.parse('{"__proto__": {"polluted": true}, "name": "ok"}');
    const { value } = redactSecrets(malicious);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((value as Record<string, unknown>).name).toBe("ok");
  });

  describe("looksLikeTokenValue", () => {
    it("flags stripe/jwt/long opaque tokens", () => {
      expect(looksLikeTokenValue("sk_live_abc123DEF456ghi789")).toBe(true);
      expect(
        looksLikeTokenValue("eyJhbGciOi.JIUzI1NiIsInR5.cCI6IkpXVCJ9abc")
      ).toBe(true);
      expect(looksLikeTokenValue("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")).toBe(true);
    });

    it("does not flag domains, emails, or short/spaced text", () => {
      expect(looksLikeTokenValue("https://www.brightfuture.sg/contact")).toBe(false);
      expect(looksLikeTokenValue("info@brightfuture.sg")).toBe(false);
      expect(looksLikeTokenValue("Bright Future Learning")).toBe(false);
      expect(looksLikeTokenValue("Singapore")).toBe(false);
    });
  });
});
