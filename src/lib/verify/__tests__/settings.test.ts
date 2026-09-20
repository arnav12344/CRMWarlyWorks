import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";
import { maskKey } from "../settings";

// Ensure a deterministic key is present for the round-trip test.
beforeAll(() => {
  if (!process.env.APP_ENCRYPTION_KEY) {
    process.env.APP_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  }
});

describe("provider key encryption at rest", () => {
  it("round-trips a provider API key through encrypt/decrypt", () => {
    const secret = "mv_live_9f8e7d6c5b4a3210_provider_key";
    const stored = encrypt(secret);
    expect(decrypt(stored)).toBe(secret);
  });

  it("never stores the key in plaintext (ciphertext differs from input)", () => {
    const secret = "zb_secret_key_abcdef123456";
    const stored = encrypt(secret);
    expect(stored).not.toContain(secret);
    expect(stored).not.toBe(secret);
    // Base64 ciphertext of iv|tag|data is not human-readable plaintext.
    expect(stored).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const secret = "same-secret";
    expect(encrypt(secret)).not.toBe(encrypt(secret));
  });

  it("masks a key to show only the last 4 characters", () => {
    expect(maskKey("abcd1234efgh5678")).toMatch(/5678$/);
    expect(maskKey("abcd1234efgh5678")).not.toContain("abcd1234");
    expect(maskKey(null)).toBeNull();
  });
});
