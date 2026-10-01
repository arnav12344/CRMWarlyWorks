/**
 * Encrypted provider-key persistence built on the Setting table.
 *
 * Keys are stored in Setting.valueEncrypted via AES-256-GCM (src/lib/crypto.ts)
 * and are NEVER returned to the client in plaintext — the UI only ever sees a
 * masked "last 4" preview produced by `maskKey`.
 */

import { prisma } from "@/lib/db";
import { encrypt, tryDecrypt } from "@/lib/crypto";

/** Setting keys used by verification. */
export const SETTING_KEYS = {
  millionverifier: "millionverifier_api_key",
  zerobounce: "zerobounce_api_key",
  timezone: "app_timezone",
  dailySendLimit: "daily_send_limit",
  imapState: "imap_state",
  imapLastSync: "imap_last_sync",
  /** JSON { html, text, source, updatedAt } — added to every outgoing email. */
  emailSignature: "email_signature",
} as const;

export type ProviderKeyName = "millionverifier" | "zerobounce";

/** Decrypted provider keys (null when not configured). */
export interface ProviderKeys {
  millionverifier: string | null;
  zerobounce: string | null;
}

/** Load and decrypt provider keys from the Setting table. */
export async function loadProviderKeys(): Promise<ProviderKeys> {
  const rows = await prisma.setting.findMany({
    where: {
      key: { in: [SETTING_KEYS.millionverifier, SETTING_KEYS.zerobounce] },
    },
    select: { key: true, valueEncrypted: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.valueEncrypted]));
  return {
    millionverifier: tryDecrypt(byKey.get(SETTING_KEYS.millionverifier)),
    zerobounce: tryDecrypt(byKey.get(SETTING_KEYS.zerobounce)),
  };
}

/** Persist a provider key, encrypting it at rest. Empty value clears the key. */
export async function saveSetting(key: string, plaintext: string): Promise<void> {
  const trimmed = plaintext.trim();
  const valueEncrypted = trimmed.length ? encrypt(trimmed) : null;
  await prisma.setting.upsert({
    where: { key },
    update: { valueEncrypted },
    create: { key, valueEncrypted },
  });
}

/** Read a plaintext (non-secret) setting such as the timezone. */
export async function getPlainSetting(
  key: string,
  fallback: string
): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return tryDecrypt(row?.valueEncrypted) ?? fallback;
}

/** Mask a secret for display: only the last 4 characters are shown. */
export function maskKey(plaintext: string | null): string | null {
  if (!plaintext) return null;
  const last4 = plaintext.slice(-4);
  return `••••••••${last4}`;
}

/** Daily send cap (Singapore day). Defaults to 50. */
export async function getDailySendLimit(): Promise<number> {
  const raw = await getPlainSetting(SETTING_KEYS.dailySendLimit, "50");
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 50;
}
