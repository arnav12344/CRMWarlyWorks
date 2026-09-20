import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { addBusinessDays } from "@/lib/reminders";

export const runtime = "nodejs";

/** Create a manual follow-up, or update an existing one's status. */
const createSchema = z.object({
  contactId: z.string().min(1),
  businessDaysOffset: z.number().int().min(0).default(2),
  reason: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["pending", "done", "snoozed"]),
  snoozeBusinessDays: z.number().int().min(1).optional(),
});

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);

  const update = updateSchema.safeParse(raw);
  if (update.success) {
    const { id, status, snoozeBusinessDays } = update.data;
    const existing = await prisma.followUp.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const data: Record<string, unknown> = { status };
    if (status === "done") data.completedAt = new Date();
    if (status === "snoozed") {
      data.dueAt = addBusinessDays(new Date(), snoozeBusinessDays ?? 1);
      data.status = "pending";
    }
    const followUp = await prisma.followUp.update({ where: { id }, data });
    return NextResponse.json({ followUp });
  }

  const create = createSchema.safeParse(raw);
  if (create.success) {
    const { contactId, businessDaysOffset, reason } = create.data;
    const followUp = await prisma.followUp.create({
      data: {
        contactId,
        businessDaysOffset,
        dueAt: addBusinessDays(new Date(), businessDaysOffset),
        reason: reason ?? `Follow-up in ${businessDaysOffset} business days`,
        status: "pending",
      },
    });
    await prisma.activity.create({
      data: {
        contactId,
        type: "followup_scheduled",
        summary: `Scheduled a follow-up in ${businessDaysOffset} business days`,
      },
    });
    return NextResponse.json({ followUp });
  }

  return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
}
