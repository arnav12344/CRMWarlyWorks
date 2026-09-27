import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enrollContact } from "@/lib/outreach";
import { advanceEnrollments } from "@/lib/sequences";

export const runtime = "nodejs";

const schema = z.object({
  sequenceId: z.string().min(1),
  // Kept small per request so it always finishes inside the function limit.
  contactIds: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * Enroll contacts in a sequence, then immediately draft any step that is due
 * now (usually the first email) into Ready to send. Later steps are drafted
 * by the scheduled tick once they're due.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide sequenceId and up to 100 contactIds." }, { status: 400 });
  }
  const { sequenceId, contactIds } = parsed.data;

  let enrolled = 0;
  const skipped: Array<{ contactId: string; reason: string }> = [];
  const enrollmentIds: string[] = [];
  for (const contactId of contactIds) {
    const res = await enrollContact(prisma, contactId, sequenceId);
    if (res.ok && res.enrollmentId) {
      enrolled += 1;
      enrollmentIds.push(res.enrollmentId);
    } else skipped.push({ contactId, reason: res.reason ?? "skipped" });
  }

  const advanced = enrollmentIds.length
    ? await advanceEnrollments(prisma, new Date(), undefined, { enrollmentIds })
    : { createdMessageIds: [] };

  return NextResponse.json({
    ok: true,
    enrolled,
    skipped: skipped.length,
    skippedDetails: skipped,
    queuedMessages: advanced.createdMessageIds.length,
  });
}
