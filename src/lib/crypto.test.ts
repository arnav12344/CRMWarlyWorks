import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, tryDecrypt } from "./crypto";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

describe("crypto (AES-256-GCM)", () => {
  it("round-trips a secret", () => {
    const secret = "mv_live_1234567890";
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(decrypt(enc)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encrypt("same-value");
    const b = encrypt("same-value");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("tryDecrypt returns null for invalid payloads", () => {
    expect(tryDecrypt(null)).toBeNull();
    expect(tryDecrypt("not-valid-base64-ciphertext")).toBeNull();
  });
});
