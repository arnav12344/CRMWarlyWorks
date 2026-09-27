import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isEmailSuppressed, SENDABLE_STATUSES } from "@/lib/outreach";

export const runtime = "nodejs";

/**
 * Create a single outbound email, or edit one that hasn't been sent yet.
 * Subject/body are the already-personalized text.
 */
const schema = z.object({
  id: z.string().optional(),
  contactId: z.string().min(1),
  templateId: z.string().nullable().optional(),
  subject: z.string().default(""),
  body: z.string().default(""),
  status: z.enum(["draft", "queued"]).default("queued"),
});

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }
  const { id, contactId, templateId, subject, body, status } = parsed.data;

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }
  if (contact.suppressed || (await isEmailSuppressed(prisma, contact.email))) {
    return NextResponse.json({ error: "Contact is suppressed — cannot email them." }, { status: 422 });
  }

  if (id) {
    const existing = await prisma.emailMessage.findUnique({ where: { id } });
    if (!existing || existing.contactId !== contactId) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }
    if (!(SENDABLE_STATUSES as readonly string[]).includes(existing.status)) {
      return NextResponse.json({ error: `Already ${existing.status} — can't edit.` }, { status: 422 });
    }
    const message = await prisma.emailMessage.update({
      where: { id },
      data: { subject, body, status, error: null },
    });
    return NextResponse.json({ message });
  }

  const message = await prisma.emailMessage.create({
    data: {
      contactId,
      templateId: templateId ?? null,
      subject,
      body,
      status,
      direction: "outbound",
      toAddress: contact.email?.toLowerCase() ?? null,
    },
  });
  await prisma.activity.create({
    data: {
      contactId,
      type: status === "queued" ? "email_queued" : "email_drafted",
      summary:
        status === "queued"
          ? `Added to Ready to send: ${subject || "(no subject)"}`
          : `Saved draft: ${subject || "(no subject)"}`,
    },
  });

  return NextResponse.json({ message });
}
