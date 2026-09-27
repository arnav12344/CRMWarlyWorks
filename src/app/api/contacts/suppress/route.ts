import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";
import { suppressContact } from "@/lib/outreach";

export const runtime = "nodejs";

/**
 * POST /api/contacts/suppress
 *
 * Mark a contact as suppressed (do-not-contact) and record a Suppression row
 * for its email. Setting suppressed=false un-suppresses.
 *
 * Body: { contactId: string, suppressed?: boolean, reason?: string }
 */
const bodySchema = z.object({
  contactId: z.string().min(1),
  suppressed: z.boolean().optional().default(true),
  reason: z.string().optional(),
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
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { contactId, suppressed, reason } = parsed.data;
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  if (suppressed) {
    // Also stops sequences and pulls unsent emails out of Ready to send.
    await suppressContact(prisma, contactId, reason ?? "Manually suppressed");
    return NextResponse.json({ ok: true, suppressed });
  }

  await prisma.contact.update({ where: { id: contactId }, data: { suppressed: false } });
  const normalizedEmail = normalizeEmail(contact.email);
  if (normalizedEmail) {
    await prisma.suppression.delete({ where: { email: normalizedEmail } }).catch(() => undefined);
  }
  await prisma.activity.create({
    data: { contactId, type: "unsuppressed", summary: "Removed from suppression" },
  });
  return NextResponse.json({ ok: true, suppressed });
}
