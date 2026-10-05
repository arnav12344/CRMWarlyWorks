import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveContact } from "@/lib/contactResolve";
import { isEmailSuppressed } from "@/lib/outreach";
import { personalizePlan, scheduleFollowUpEmails, validateFollowUps, type FollowUpInput } from "@/lib/followupPlan";
import { contactMergeContext } from "@/lib/merge";
import { resolveSchedule } from "@/lib/schedule";
import { readMailConfig } from "@/lib/mail/config";
import { normalizeEmail } from "@/lib/email";
import { replySubject } from "@/lib/mail/compose";

export const runtime = "nodejs";

const whenSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("afterDays"), days: z.number().int().min(1).max(60) }),
  z.object({ kind: z.literal("date"), dateISO: z.string().datetime({ offset: true }) }),
]);

const schema = z
  .object({
    contactId: z.string().min(1).optional(),
    email: z.string().max(320).optional(),
    fullName: z.string().max(200).optional(),
    orgName: z.string().max(200).optional(),
    first: z.object({
      subject: z.string().min(1).max(300),
      body: z.string().max(20000),
    }),
    firstSchedule: z.object({
      kind: z.enum(["now", "today", "thursday"]),
      todayTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    }),
    followUps: z
      .array(
        z.object({
          subject: z.string().max(300).optional(),
          body: z.string().max(20000),
          when: whenSchema,
        })
      )
      .max(10)
      .default([]),
    /** Send the first email as a reply in the thread of your last email to this contact. */
    replyToLast: z.boolean().optional(),
  })
  .refine((v) => v.contactId || v.email, { message: "Provide a contact or an email address." });

/**
 * POST /api/messages/plan
 * Compose a first email plus write-your-own follow-ups in one go. The first
 * email lands in Ready to send (optionally scheduled); each follow-up is a
 * linked message that auto-sends on schedule unless the contact replies.
 * Nothing is sent here — the cron releases due messages.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const d = parsed.data;
  const now = new Date();

  // Validate the follow-up plan up front so nothing is written on a bad plan.
  const followUps: FollowUpInput[] = d.followUps.map((f) => ({ subject: f.subject, body: f.body, when: f.when }));
  const planCheck = validateFollowUps(followUps, now);
  if (!planCheck.ok) {
    return NextResponse.json({ error: planCheck.reason }, { status: 400 });
  }

  const resolved = await resolveContact(prisma, {
    contactId: d.contactId,
    email: d.email,
    fullName: d.fullName,
    orgName: d.orgName,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.reason, code: resolved.code }, { status: resolved.code === "not_found" ? 404 : 400 });
  }
  const contact = resolved.contact;

  const to = normalizeEmail(contact.email);
  if (!to) {
    return NextResponse.json({ error: "This contact has no email address. Add one first.", code: "invalid" }, { status: 400 });
  }
  if (contact.suppressed || (await isEmailSuppressed(prisma, to))) {
    return NextResponse.json(
      { error: "This address is on the do-not-contact list.", code: "suppressed" },
      { status: 409 }
    );
  }

  const scheduledFor = resolveSchedule(d.firstSchedule.kind, now, d.firstSchedule.todayTime);

  // Fill this lead's fields ({{firstName|there}}, {{orgName}}, snippets) into the
  // first email and every follow-up. Anything this lead has no value for stays
  // visible as [field?], and sendMessage won't send it until it's fixed.
  const [withOrg, snippets] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contact.id },
      include: {
        organization: { select: { name: true, city: true, country: true, contactType: { select: { name: true } } } },
      },
    }),
    prisma.snippet.findMany({ select: { label: true, body: true } }),
  ]);
  const plan = personalizePlan({
    first: d.first,
    followUps,
    context: contactMergeContext({ ...(withOrg ?? contact), email: to }),
    snippets,
  });

  // Optionally continue the thread of the last email you sent this contact.
  const lastSent = d.replyToLast
    ? await prisma.emailMessage.findFirst({
        where: { contactId: contact.id, direction: "outbound", sentAt: { not: null } },
        orderBy: { sentAt: "desc" },
        select: { id: true, subject: true },
      })
    : null;
  const firstSubject = lastSent ? replySubject(lastSent.subject) : plan.first.subject.trim();

  // Create the first email in Ready to send (never sent here).
  const first = await prisma.emailMessage.create({
    data: {
      contactId: contact.id,
      direction: "outbound",
      status: "queued",
      subject: firstSubject,
      body: plan.first.body,
      toAddress: to,
      fromAddress: readMailConfig()?.fromAddress ?? null,
      scheduledFor,
      parentMessageId: lastSent?.id ?? null,
    },
  });

  // Schedule the write-your-own follow-ups against that first email.
  const fuResult = await scheduleFollowUpEmails(prisma, {
    firstMessageId: first.id,
    firstSubject,
    contactId: contact.id,
    toAddress: to,
    followUps: plan.followUps,
    now,
  });
  if (!fuResult.ok) {
    // Roll back the first email so we don't leave a half-made plan.
    await prisma.emailMessage.delete({ where: { id: first.id } }).catch(() => undefined);
    return NextResponse.json({ error: fuResult.reason, code: "invalid" }, { status: 400 });
  }

  await prisma.activity.create({
    data: {
      contactId: contact.id,
      type: "email_queued",
      summary:
        followUps.length > 0
          ? `Queued an email + ${followUps.length} follow-up${followUps.length === 1 ? "" : "s"}: ${firstSubject}`
          : `Added to Ready to send: ${firstSubject}`,
      meta: JSON.stringify({ firstMessageId: first.id, followUpCount: followUps.length }),
    },
  });

  return NextResponse.json({
    ok: true,
    contactId: contact.id,
    firstMessageId: first.id,
    followUpCount: fuResult.createdIds.length,
    createdContact: resolved.createdContact,
    scheduledFor: scheduledFor ? scheduledFor.toISOString() : null,
    // Saved, but these won't send until the missing fields are filled in.
    needsFixing: plan.unfilled,
  });
}
