/**
 * Log an email the user sent themselves (from Gmail, phone, etc.) so the CRM
 * tracks it exactly like an app-sent email:
 *
 *  - an outbound EmailMessage with status "sent" + sentAt, so it shows in the
 *    contact's thread, counts in analytics and "sent today", and
 *  - reply detection works: processInbound matches a reply to a contact by the
 *    sender address whenever that contact has a sent outbound message,
 *  - the contact moves to a pipeline stage (the one picked, or "Contacted"),
 *  - follow-up reminders are scheduled (2 & 3 business days, a chosen date, or none).
 *
 * Nothing is sent here — this only records something already sent.
 */

import type { PrismaClient } from "@prisma/client";
import { scheduleFollowUps, APP_TIMEZONE } from "./reminders";
import { normalizeEmail } from "./email";
import { isEmailSuppressed, moveToStage } from "./outreach";
import { resolveContact } from "./contactResolve";

type Db = PrismaClient;

/** Allow a little clock skew between the browser and server. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export type FollowUpChoice = { kind: "default" } | { kind: "none" } | { kind: "date"; dueAt: Date };

export interface LogSentEmailInput {
  /** Existing contact. When absent, `email` is used to find or create one. */
  contactId?: string;
  email?: string;
  fullName?: string;
  orgName?: string;
  subject: string;
  body?: string;
  /** When it was actually sent. Defaults to now; may not be in the future. */
  sentAt?: Date;
  /** Stage to put the contact in. Omit to use "Contacted" (never downgrades). */
  pipelineStageId?: string | null;
  followUp?: FollowUpChoice;
  /** Our sending address, recorded on the message (optional). */
  fromAddress?: string | null;
  now?: Date;
  timeZone?: string;
}

export type LogSentEmailResult =
  | { ok: true; contactId: string; messageId: string; createdContact: boolean; followUpIds: string[] }
  | { ok: false; code: "invalid" | "not_found" | "suppressed"; reason: string };

function fail(code: "invalid" | "not_found" | "suppressed", reason: string): LogSentEmailResult {
  return { ok: false, code, reason };
}

export async function logSentEmail(db: Db, input: LogSentEmailInput): Promise<LogSentEmailResult> {
  const now = input.now ?? new Date();
  const timeZone = input.timeZone ?? APP_TIMEZONE;

  const subject = input.subject?.trim() ?? "";
  if (!subject) return fail("invalid", "Add the subject of the email you sent.");
  if (subject.length > 300) return fail("invalid", "Subject is too long (max 300 characters).");

  const sentAt = input.sentAt ?? now;
  if (Number.isNaN(sentAt.getTime())) return fail("invalid", "The sent date isn't valid.");
  if (sentAt.getTime() > now.getTime() + FUTURE_SKEW_MS) {
    return fail("invalid", "The sent time is in the future. Log emails after you've sent them.");
  }

  const followUp = input.followUp ?? { kind: "default" };
  if (followUp.kind === "date" && Number.isNaN(followUp.dueAt.getTime())) {
    return fail("invalid", "The follow-up date isn't valid.");
  }

  // Resolve (or create) the contact.
  const resolved = await resolveContact(db, {
    contactId: input.contactId,
    email: input.email,
    fullName: input.fullName,
    orgName: input.orgName,
  });
  if (!resolved.ok) {
    return fail(resolved.code, resolved.code === "invalid" ? "Enter the email address you sent to." : resolved.reason);
  }
  const contact = resolved.contact;
  const createdContact = resolved.createdContact;

  const to = normalizeEmail(contact.email);
  if (!to) return fail("invalid", "This contact has no email address. Add one first.");
  if (contact.suppressed || (await isEmailSuppressed(db, to))) {
    return fail("suppressed", "This address is on the do-not-contact list, so it wasn't logged.");
  }

  const bodyText = input.body?.trim() ? input.body.trim().slice(0, 20000) : null;
  const message = await db.emailMessage.create({
    data: {
      contactId: contact.id,
      direction: "outbound",
      status: "sent",
      subject,
      body: bodyText,
      toAddress: to,
      fromAddress: input.fromAddress ?? null,
      sentAt,
    },
  });

  await db.activity.create({
    data: {
      contactId: contact.id,
      type: "email_sent",
      summary: `Sent (logged manually): ${subject}`,
      meta: JSON.stringify({ messageId: message.id, to, manual: true }),
    },
  });

  // Pipeline stage: the chosen one, else "Contacted" without downgrading.
  if (input.pipelineStageId) {
    const stage = await db.pipelineStage.findFirst({ where: { id: input.pipelineStageId } });
    if (stage) {
      await db.contact.update({ where: { id: contact.id }, data: { pipelineStageId: stage.id } });
    }
  } else {
    await moveToStage(db, contact.id, "contacted", { onlyForward: true });
  }

  // Follow-up reminders replace any pending ones, like a normal send.
  const followUpIds: string[] = [];
  if (followUp.kind !== "none") {
    await db.followUp.updateMany({
      where: { contactId: contact.id, status: "pending" },
      data: { status: "done", completedAt: now },
    });
    const planned =
      followUp.kind === "date"
        ? [{ dueAt: followUp.dueAt, reason: "Follow-up (set when logging the email)", businessDaysOffset: 0 }]
        : scheduleFollowUps(sentAt, [2, 3], timeZone);
    for (const f of planned) {
      const created = await db.followUp.create({
        data: {
          contactId: contact.id,
          dueAt: f.dueAt,
          reason: f.reason,
          businessDaysOffset: f.businessDaysOffset,
          status: "pending",
        },
      });
      followUpIds.push(created.id);
    }
  }

  return { ok: true, contactId: contact.id, messageId: message.id, createdContact, followUpIds };
}
