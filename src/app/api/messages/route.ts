import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isEmailSuppressed } from "@/lib/outreach";

export const runtime = "nodejs";

/**
 * Create or update an outbound draft/queued message from the composer.
 * The subject/body passed in are the ALREADY-RENDERED personalized content
 * (the composer renders the live preview client-side and sends the result).
 */
const schema = z.object({
  id: z.string().optional(),
  contactId: z.string().min(1),
  templateId: z.string().nullable().optional(),
  subject: z.string().default(""),
  body: z.string().default(""),
  status: z.enum(["draft", "queued"]).default("draft"),
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
    return NextResponse.json(
      { error: "Contact is suppressed — cannot compose to them." },
      { status: 422 }
    );
  }

  const data = {
    contactId,
    templateId: templateId ?? null,
    subject,
    body,
    status,
    direction: "outbound",
  };

  const message = id
    ? await prisma.emailMessage.update({ where: { id }, data })
    : await prisma.emailMessage.create({ data });

  await prisma.activity.create({
    data: {
      contactId,
      type: status === "queued" ? "email_queued" : "email_drafted",
      summary:
        status === "queued"
          ? `Submitted to review queue: ${subject || "(no subject)"}`
          : `Saved draft: ${subject || "(no subject)"}`,
    },
  });

  return NextResponse.json({ message });
}
