import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildBulkDrafts } from "@/lib/bulk";
import { resolveSchedule } from "@/lib/schedule";
import { replySubject } from "@/lib/mail/compose";
import { findPlaceholders } from "@/lib/placeholders";

export const runtime = "nodejs";

/**
 * POST /api/messages/bulk
 * Render one template (saved or written inline) for many leads and add the
 * personalized emails to Ready to send. Nothing is sent here.
 *
 * Body: { contactIds: string[], templateId?: string, subject?: string, body?: string,
 *         replyToLast?: boolean }
 * With replyToLast, a lead you've emailed before gets this as a reply in the
 * thread of your last email to them ("Re: <that subject>"); others get a new email.
 */
const schema = z
  .object({
    contactIds: z.array(z.string().min(1)).min(1).max(200),
    templateId: z.string().min(1).optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    schedule: z.enum(["now", "today", "thursday", "window"]).optional(),
    todayTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    replyToLast: z.boolean().optional(),
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

  // Last email you sent each lead (newest first), for replying in its thread.
  const lastSent = new Map<string, { id: string; subject: string | null }>();
  if (parsed.data.replyToLast && result.drafts.length) {
    const sent = await prisma.emailMessage.findMany({
      where: { contactId: { in: result.drafts.map((d) => d.contactId) }, direction: "outbound", sentAt: { not: null } },
      orderBy: { sentAt: "desc" },
      select: { id: true, contactId: true, subject: true },
    });
    for (const m of sent) if (!lastSent.has(m.contactId)) lastSent.set(m.contactId, { id: m.id, subject: m.subject });
  }
  const drafts = result.drafts.map((d) => {
    const prev = lastSent.get(d.contactId);
    return prev ? { ...d, subject: replySubject(prev.subject), parentMessageId: prev.id } : { ...d, parentMessageId: null };
  });

  if (drafts.length) {
    await prisma.emailMessage.createMany({
      data: drafts.map((d) => ({
        contactId: d.contactId,
        templateId: template?.id ?? null,
        direction: "outbound",
        toAddress: d.toAddress,
        subject: d.subject,
        body: d.body,
        status: "queued",
        scheduledFor,
        parentMessageId: d.parentMessageId,
      })),
    });
    await prisma.activity.createMany({
      data: drafts.map((d) => ({
        contactId: d.contactId,
        type: "email_queued",
        summary: `${d.parentMessageId ? "Added a reply to Ready to send" : "Added to Ready to send"}: ${d.subject || "(no subject)"}`,
      })),
    });
  }

  return NextResponse.json({
    ok: true,
    created: drafts.length,
    replies: drafts.filter((d) => d.parentMessageId).length,
    skipped: result.skipped,
    scheduledFor: scheduledFor ? scheduledFor.toISOString() : null,
    // Saved, but these won't send until the missing fields are filled in.
    needsFixing: drafts
      .map((d) => ({ contactId: d.contactId, missing: findPlaceholders(d.subject, d.body) }))
      .filter((d) => d.missing.length),
  });
}
