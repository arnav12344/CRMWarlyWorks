import crypto from "node:crypto";

/**
 * AES-256-GCM encryption helpers for storing provider API keys (and other
 * secrets) at rest in Setting.valueEncrypted.
 *
 * The key comes from APP_ENCRYPTION_KEY and may be provided as:
 *   - a 64-char hex string (32 bytes), or
 *   - a base64 string that decodes to 32 bytes, or
 *   - any other string (hashed with SHA-256 to derive a 32-byte key).
 *
 * Ciphertext format (base64): iv(12) | authTag(16) | ciphertext
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function resolveKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Add it to your .env (see .env.example)."
    );
  }

  // Try hex (64 chars => 32 bytes).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  // Try base64 that decodes to exactly 32 bytes.
  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // fall through to hashing
  }

  // Fallback: derive a stable 32-byte key from an arbitrary passphrase.
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

export function encrypt(plaintext: string): string {
  const key = resolveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decrypt(payload: string): string {
  const key = resolveKey();
  const data = Buffer.from(payload, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Safely decrypt, returning null on any failure (e.g. missing/rotated key). */
export function tryDecrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return decrypt(payload);
  } catch {
    return null;
  }
}
