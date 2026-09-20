import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enrollContact } from "@/lib/outreach";
import { advanceEnrollments } from "@/lib/sequences";

export const runtime = "nodejs";

const schema = z.object({
  sequenceId: z.string().min(1),
  contactIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide sequenceId and contactIds." }, { status: 400 });
  }
  const { sequenceId, contactIds } = parsed.data;

  let enrolled = 0;
  const skipped: string[] = [];
  for (const contactId of contactIds) {
    const res = await enrollContact(prisma, contactId, sequenceId);
    if (res.ok) enrolled += 1;
    else skipped.push(contactId);
  }

  // Immediately draft any steps that are already due (dayOffset 0 first touch).
  const advanced = await advanceEnrollments(prisma);

  return NextResponse.json({
    ok: true,
    enrolled,
    skipped: skipped.length,
    queuedMessages: advanced.createdMessageIds.length,
  });
}
