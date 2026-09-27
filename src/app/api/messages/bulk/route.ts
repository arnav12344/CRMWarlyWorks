import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildBulkDrafts } from "@/lib/bulk";
import { resolveSchedule } from "@/lib/schedule";

export const runtime = "nodejs";

/**
 * POST /api/messages/bulk
 * Render one template (saved or written inline) for many leads and add the
 * personalized emails to Ready to send. Nothing is sent here.
 *
 * Body: { contactIds: string[], templateId?: string, subject?: string, body?: string }
 */
const schema = z
  .object({
    contactIds: z.array(z.string().min(1)).min(1).max(200),
    templateId: z.string().min(1).optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    schedule: z.enum(["now", "today", "thursday", "window"]).optional(),
    todayTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  })
  .refine((v) => v.templateId || (v.subject?.trim() && v.body?.trim()), {
    message: "Pick a template or write a subject and body.",
  });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { contactIds, templateId } = parsed.data;

  const template = templateId
    ? await prisma.template.findUnique({ where: { id: templateId } })
    : null;
  if (templateId && !template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  // Inline edits win over the saved template text.
  const subject = parsed.data.subject?.trim() ? parsed.data.subject : template?.subject ?? "";
  const body = parsed.data.body?.trim() ? parsed.data.body : template?.body ?? "";

  const [contacts, snippets, queued] = await Promise.all([
    prisma.contact.findMany({
      where: { id: { in: contactIds } },
      include: {
        organization: { select: { name: true, city: true, country: true, contactType: { select: { name: true } } } },
      },
    }),
    prisma.snippet.findMany(),
    prisma.emailMessage.findMany({
      where: { contactId: { in: contactIds }, direction: "outbound", status: { in: ["queued", "approved", "failed"] } },
      select: { contactId: true },
    }),
  ]);
  const emails = contacts.map((c) => c.email?.toLowerCase()).filter((e): e is string => !!e);
  const suppressions = await prisma.suppression.findMany({ where: { email: { in: emails } }, select: { email: true } });

  const result = buildBulkDrafts({
    contacts,
    template: { subject, body },
    snippets: snippets.map((s) => ({ label: s.label, body: s.body })),
    suppressedEmails: new Set(suppressions.map((s) => s.email)),
    alreadyQueued: new Set(queued.map((q) => q.contactId)),
  });

  const scheduledFor = resolveSchedule(parsed.data.schedule ?? "now", new Date(), parsed.data.todayTime);

  if (result.drafts.length) {
    await prisma.emailMessage.createMany({
      data: result.drafts.map((d) => ({
        contactId: d.contactId,
        templateId: template?.id ?? null,
        direction: "outbound",
        toAddress: d.toAddress,
        subject: d.subject,
        body: d.body,
        status: "queued",
        scheduledFor,
      })),
    });
    await prisma.activity.createMany({
      data: result.drafts.map((d) => ({
        contactId: d.contactId,
        type: "email_queued",
        summary: `Added to Ready to send: ${d.subject || "(no subject)"}`,
      })),
    });
  }

  return NextResponse.json({
    ok: true,
    created: result.drafts.length,
    skipped: result.skipped,
    scheduledFor: scheduledFor ? scheduledFor.toISOString() : null,
    needsFixing: result.drafts.filter((d) => d.missing.length).map((d) => ({ contactId: d.contactId, missing: d.missing })),
  });
}
