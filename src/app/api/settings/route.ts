import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SETTING_KEYS,
  loadProviderKeys,
  saveSetting,
  getPlainSetting,
  getDailySendLimit,
  maskKey,
} from "@/lib/verify/settings";

export const runtime = "nodejs";

const DEFAULT_TIMEZONE = "Asia/Singapore";

async function snapshot() {
  const keys = await loadProviderKeys();
  return {
    millionverifier: { configured: Boolean(keys.millionverifier), masked: maskKey(keys.millionverifier) },
    zerobounce: { configured: Boolean(keys.zerobounce), masked: maskKey(keys.zerobounce) },
    timezone: await getPlainSetting(SETTING_KEYS.timezone, DEFAULT_TIMEZONE),
    dailySendLimit: await getDailySendLimit(),
  };
}

/** GET /api/settings — masked key previews only; plaintext never leaves the server. */
export async function GET() {
  return NextResponse.json(await snapshot());
}

/**
 * POST /api/settings — only provided fields are updated. An empty string
 * clears a key. Keys are encrypted at rest.
 */
const bodySchema = z.object({
  millionverifierKey: z.string().optional(),
  zerobounceKey: z.string().optional(),
  timezone: z.string().optional(),
  dailySendLimit: z.number().int().min(1).max(500).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }
  const { millionverifierKey, zerobounceKey, timezone, dailySendLimit } = parsed.data;

  if (millionverifierKey !== undefined) await saveSetting(SETTING_KEYS.millionverifier, millionverifierKey);
  if (zerobounceKey !== undefined) await saveSetting(SETTING_KEYS.zerobounce, zerobounceKey);
  if (timezone?.trim()) await saveSetting(SETTING_KEYS.timezone, timezone.trim());
  if (dailySendLimit !== undefined) await saveSetting(SETTING_KEYS.dailySendLimit, String(dailySendLimit));

  return NextResponse.json({ ok: true, ...(await snapshot()) });
}
