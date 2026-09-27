import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { approveMessage, rejectMessage, sendMessage } from "@/lib/outreach";
import { getMailer } from "@/lib/mail/mailer";
import { getDailySendLimit, getPlainSetting, SETTING_KEYS } from "@/lib/verify/settings";
import { APP_TIMEZONE } from "@/lib/reminders";

export const runtime = "nodejs";

/**
 * Actions on an outbound message.
 *   send   — deliver it for real via Gmail (clicking Send counts as approval)
 *   skip   — move it out of Ready to send (back to drafts)
 *   approve— legacy no-op-ish status change, kept for compatibility
 */
const schema = z.object({
  messageId: z.string().min(1),
  action: z.enum(["approve", "send", "reject", "skip"]),
});

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  const { messageId, action } = parsed.data;

  if (action === "approve") {
    const res = await approveMessage(prisma, messageId);
    return NextResponse.json(res, { status: res.ok ? 200 : 422 });
  }
  if (action === "reject" || action === "skip") {
    const res = await rejectMessage(prisma, messageId);
    return NextResponse.json(res, { status: res.ok ? 200 : 422 });
  }

  const [dailyLimit, timeZone] = await Promise.all([
    getDailySendLimit(),
    getPlainSetting(SETTING_KEYS.timezone, APP_TIMEZONE),
  ]);
  const res = await sendMessage(prisma, messageId, { mailer: getMailer(), dailyLimit, timeZone });
  const status = res.ok ? 200 : res.code === "daily_limit" ? 429 : res.code === "not_configured" ? 503 : 422;
  return NextResponse.json(res, { status });
}
