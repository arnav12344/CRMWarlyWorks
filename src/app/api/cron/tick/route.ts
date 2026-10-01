import { prisma } from "@/lib/db";
import { createTickHandler } from "@/lib/cron";
import { advanceEnrollments } from "@/lib/sequences";
import { syncInbox } from "@/lib/mail/inbox";
import { releaseScheduled } from "@/lib/outreach";
import { getMailer } from "@/lib/mail/mailer";
import { getDailySendLimit, getPlainSetting, SETTING_KEYS } from "@/lib/verify/settings";
import { inSendWindow } from "@/lib/schedule";
import { APP_TIMEZONE } from "@/lib/reminders";
import { getSignature } from "@/lib/mail/signatureStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/tick — called every 10 minutes by the Netlify scheduled
 * function (netlify/functions/tick.mts). Requires CRON_SECRET.
 * Steps: draft due sequence steps → release scheduled sends → sync inbox.
 */
export const POST = createTickHandler({
  secret: process.env.CRON_SECRET,
  advance: () => advanceEnrollments(prisma),
  release: async (): Promise<Record<string, unknown>> => {
    const now = new Date();
    const [dailyLimit, timeZone, signature] = await Promise.all([
      getDailySendLimit(),
      getPlainSetting(SETTING_KEYS.timezone, APP_TIMEZONE),
      getSignature(),
    ]);
    const r = await releaseScheduled(prisma, {
      mailer: getMailer(),
      now,
      timeZone,
      dailyLimit,
      signature,
      // During the weekly window, also flush emails parked for "next window".
      includeWindow: inSendWindow(now),
    });
    return r as unknown as Record<string, unknown>;
  },
  sync: (deadlineMs) => syncInbox(prisma, { deadlineMs }) as unknown as Promise<Record<string, unknown>>,
  // Netlify sync functions stop at 10s; connect + login take ~2-3s, so keep
  // the fetch loop short. Unprocessed mail is picked up on the next tick.
  syncBudgetMs: 4500,
});
