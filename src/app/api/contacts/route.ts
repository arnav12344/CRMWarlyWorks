import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  // Kept small per request so it always finishes inside the function limit.
  contactIds: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * Permanently delete contacts. Related messages, activities, sequence
 * enrollments and follow-ups cascade automatically (onDelete: Cascade in the
 * Prisma schema). Organizations are left intact — a contact leaving does not
 * remove the org, which may still hold other contacts.
 */
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide 1 to 100 contactIds to delete." },
      { status: 400 }
    );
  }
  const { contactIds } = parsed.data;

  const result = await prisma.contact.deleteMany({
    where: { id: { in: contactIds } },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
