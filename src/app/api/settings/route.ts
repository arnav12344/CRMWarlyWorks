import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SETTING_KEYS,
  loadProviderKeys,
  saveSetting,
  getPlainSetting,
  maskKey,
} from "@/lib/verify/settings";

export const runtime = "nodejs";

const DEFAULT_TIMEZONE = "Asia/Singapore";

/**
 * GET /api/settings
 *
 * Returns whether each provider key is configured and a masked (last-4) preview
 * only. The plaintext key is NEVER sent to the client.
 */
export async function GET() {
  const keys = await loadProviderKeys();
  const timezone = await getPlainSetting(SETTING_KEYS.timezone, DEFAULT_TIMEZONE);
  return NextResponse.json({
    millionverifier: {
      configured: Boolean(keys.millionverifier),
      masked: maskKey(keys.millionverifier),
    },
    zerobounce: {
      configured: Boolean(keys.zerobounce),
      masked: maskKey(keys.zerobounce),
    },
    timezone,
  });
}

/**
 * POST /api/settings
 *
 * Persist provider API keys (encrypted at rest) and general config. Fields are
 * optional; only provided fields are updated. Sending an empty string clears a
 * key. Plaintext keys are never returned — the response echoes masked previews.
 */
const bodySchema = z.object({
  millionverifierKey: z.string().optional(),
  zerobounceKey: z.string().optional(),
  timezone: z.string().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }

  const { millionverifierKey, zerobounceKey, timezone } = parsed.data;

  if (millionverifierKey !== undefined) {
    await saveSetting(SETTING_KEYS.millionverifier, millionverifierKey);
  }
  if (zerobounceKey !== undefined) {
    await saveSetting(SETTING_KEYS.zerobounce, zerobounceKey);
  }
  if (timezone !== undefined && timezone.trim()) {
    // Timezone is not secret, but the setting store encrypts everything; that's
    // fine and keeps a single code path.
    await saveSetting(SETTING_KEYS.timezone, timezone.trim());
  }

  const keys = await loadProviderKeys();
  const tz = await getPlainSetting(SETTING_KEYS.timezone, DEFAULT_TIMEZONE);
  return NextResponse.json({
    ok: true,
    millionverifier: {
      configured: Boolean(keys.millionverifier),
      masked: maskKey(keys.millionverifier),
    },
    zerobounce: {
      configured: Boolean(keys.zerobounce),
      masked: maskKey(keys.zerobounce),
    },
    timezone: tz,
  });
}
