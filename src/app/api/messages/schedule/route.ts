import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { scheduleMessages } from "@/lib/outreach";
import { resolveSchedule } from "@/lib/schedule";

export const runtime = "nodejs";

/**
 * POST /api/messages/schedule — set (or clear) when queued messages send.
 * Body: { messageIds, schedule: now|today|thursday, todayTime? }.
 * "now" clears the schedule so they go out on the next Send / tick.
 */
const schema = z.object({
  messageIds: z.array(z.string().min(1)).min(1).max(500),
  schedule: z.enum(["now", "today", "thursday", "window"]),
  todayTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const scheduledFor = resolveSchedule(parsed.data.schedule, new Date(), parsed.data.todayTime);
  const count = await scheduleMessages(prisma, parsed.data.messageIds, scheduledFor);
  return NextResponse.json({ ok: true, count, scheduledFor: scheduledFor ? scheduledFor.toISOString() : null });
}
