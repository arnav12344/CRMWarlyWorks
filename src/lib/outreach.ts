/**
 * Outreach send + tracking engine (SIMULATED — no SMTP).
 *
 * "Sending" a message does NOT deliver real email. Instead it marks the
 * EmailMessage as sent, stamps sentAt, logs an Activity, moves the contact's
 * pipeline stage forward, and auto-schedules the 2-day / 3-day Singapore
 * business-day follow-ups. Replies / bounces / opens are simulated via
 * `simulateEvent` so the tracking, suppression and auto-stop flows can be
 * demonstrated end-to-end.
 *
 * Suppression is enforced here and in the sequence engine: a suppressed
 * contact is NEVER sent to.
 */

import type { PrismaClient } from "@prisma/client";
import { scheduleFollowUps, APP_TIMEZONE } from "./reminders";
import { normalizeEmail } from "./email";
import { SEED_STAGE_NAME_BY_ROLE, type StageRole } from "./stageRoles";

type Db = PrismaClient;

/** Is this email on the suppression (do-not-contact) list? Case-insensitive. */
export async function isEmailSuppressed(db: Db, email: string | null | undefined): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = await db.suppression.findUnique({ where: { email: normalized } });
  return !!row;
}

/**
 * Move a contact to the pipeline stage that carries the given stable `role`.
 *
 * Stages are user-editable data, so we resolve by the machine `role` (never the
 * display name). If no stage carries the role yet (e.g. an older seed), fall
 * back to the original seed display name. No-op when neither resolves, so a
 * user who deleted the stage entirely never causes an error.
 */
async function moveToStage(db: Db, contactId: string, role: StageRole): Promise<void> {
  let stage = await db.pipelineStage.findFirst({ where: { role } });
  if (!stage) {
    stage = await db.pipelineStage.findFirst({
      where: { name: SEED_STAGE_NAME_BY_ROLE[role] },
    });
  }
  if (stage) {
    await db.contact.update({
      where: { id: contactId },
      data: { pipelineStageId: stage.id },
    });
  }
}

export interface SendResult {
  ok: boolean;
  reason?: string;
  messageId?: string;
  followUpIds?: string[];
}

/**
 * Simulate sending an approved/draft/queued message.
 *
 * Guards against suppressed contacts. On success: status -> sent, sentAt set,
 * Activity logged, pipeline stage advanced to "Contacted" (if not already
 * further along a positive stage), and 2-day/3-day follow-ups scheduled.
 */
export async function simulateSend(
  db: Db,
  messageId: string,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE
): Promise<SendResult> {
  const message = await db.emailMessage.findUnique({
    where: { id: messageId },
    include: { contact: true },
  });
  if (!message) return { ok: false, reason: "Message not found." };

  const contact = message.contact;
  if (contact.suppressed || (await isEmailSuppressed(db, contact.email))) {
    return { ok: false, reason: "Contact is suppressed — send blocked." };
  }
  if (message.status === "sent") {
    return { ok: false, reason: "Message already sent." };
  }

  await db.emailMessage.update({
    where: { id: messageId },
    data: { status: "sent", sentAt: now },
  });

  await db.activity.create({
    data: {
      contactId: contact.id,
      type: "email_sent",
      summary: `Sent (simulated): ${message.subject ?? "(no subject)"}`,
      meta: JSON.stringify({ messageId, simulated: true }),
    },
  });

  await moveToStage(db, contact.id, "contacted");

  // Auto-schedule business-day follow-ups from the send date.
  const followUps = scheduleFollowUps(now, [2, 3], timeZone);
  const followUpIds: string[] = [];
  for (const f of followUps) {
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

  return { ok: true, messageId, followUpIds };
}

/** Approve a message (draft/queued -> approved) so it can be sent. */
export async function approveMessage(db: Db, messageId: string): Promise<SendResult> {
  const message = await db.emailMessage.findUnique({ where: { id: messageId } });
  if (!message) return { ok: false, reason: "Message not found." };
  await db.emailMessage.update({
    where: { id: messageId },
    data: { status: "approved" },
  });
  await db.activity.create({
    data: {
      contactId: message.contactId,
      type: "email_approved",
      summary: `Approved for send: ${message.subject ?? "(no subject)"}`,
    },
  });
  return { ok: true, messageId };
}

/** Reject a draft/queued/approved message (back to draft, or discard). */
export async function rejectMessage(db: Db, messageId: string): Promise<SendResult> {
  const message = await db.emailMessage.findUnique({ where: { id: messageId } });
  if (!message) return { ok: false, reason: "Message not found." };
  await db.emailMessage.update({
    where: { id: messageId },
    data: { status: "draft" },
  });
  await db.activity.create({
    data: {
      contactId: message.contactId,
      type: "email_rejected",
      summary: `Sent back to drafts: ${message.subject ?? "(no subject)"}`,
    },
  });
  return { ok: true, messageId };
}

export type SimulatedEvent = "open" | "reply" | "bounce";

export interface SimulateEventResult {
  ok: boolean;
  reason?: string;
  stoppedEnrollmentIds?: string[];
  suppressed?: boolean;
}

/**
 * Simulate an inbound tracking event on a SENT message.
 *
 * - open  => stamp openedAt, log Activity, move to "Contacted" (no stop).
 * - reply => stamp repliedAt, status replied, move to "Replied", STOP active
 *            enrollments (reason: replied).
 * - bounce=> stamp bouncedAt, status bounced, move to "Not Interested", STOP
 *            active enrollments and ADD to Suppression.
 */
export async function simulateEvent(
  db: Db,
  messageId: string,
  event: SimulatedEvent,
  now: Date = new Date()
): Promise<SimulateEventResult> {
  const message = await db.emailMessage.findUnique({
    where: { id: messageId },
    include: { contact: true },
  });
  if (!message) return { ok: false, reason: "Message not found." };
  const contact = message.contact;

  if (event === "open") {
    await db.emailMessage.update({
      where: { id: messageId },
      data: { openedAt: message.openedAt ?? now },
    });
    await db.activity.create({
      data: {
        contactId: contact.id,
        type: "email_opened",
        summary: `Opened (simulated): ${message.subject ?? "(no subject)"}`,
      },
    });
    return { ok: true };
  }

  if (event === "reply") {
    await db.emailMessage.update({
      where: { id: messageId },
      data: { status: "replied", repliedAt: now },
    });
    await db.activity.create({
      data: {
        contactId: contact.id,
        type: "email_replied",
        summary: `Replied (simulated): ${message.subject ?? "(no subject)"}`,
      },
    });
    await moveToStage(db, contact.id, "replied");
    const stopped = await stopActiveEnrollments(db, contact.id, "replied");
    return { ok: true, stoppedEnrollmentIds: stopped };
  }

  // bounce
  await db.emailMessage.update({
    where: { id: messageId },
    data: { status: "bounced", bouncedAt: now },
  });
  await db.activity.create({
    data: {
      contactId: contact.id,
      type: "email_bounced",
      summary: `Bounced (simulated): ${message.subject ?? "(no subject)"}`,
    },
  });
  await moveToStage(db, contact.id, "not_interested");
  const stopped = await stopActiveEnrollments(db, contact.id, "bounced");
  const suppressed = await suppressContact(db, contact.id, "bounced");
  return { ok: true, stoppedEnrollmentIds: stopped, suppressed };
}

/** Stop all active enrollments for a contact with a reason. Returns their ids. */
export async function stopActiveEnrollments(
  db: Db,
  contactId: string,
  reason: string
): Promise<string[]> {
  const active = await db.sequenceEnrollment.findMany({
    where: { contactId, status: "active" },
    select: { id: true },
  });
  if (active.length === 0) return [];
  await db.sequenceEnrollment.updateMany({
    where: { contactId, status: "active" },
    data: { status: "stopped", stoppedReason: reason },
  });
  return active.map((e) => e.id);
}

/**
 * Mark a contact suppressed and add its email to the Suppression list. Also
 * stops active enrollments. Returns true when an email was actually added.
 */
export async function suppressContact(
  db: Db,
  contactId: string,
  reason: string
): Promise<boolean> {
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return false;

  await db.contact.update({
    where: { id: contactId },
    data: { suppressed: true },
  });
  await stopActiveEnrollments(db, contactId, reason);
  await db.activity.create({
    data: {
      contactId,
      type: "suppressed",
      summary: `Added to suppression list: ${reason}`,
    },
  });

  const normalizedEmail = normalizeEmail(contact.email);
  if (normalizedEmail) {
    await db.suppression.upsert({
      where: { email: normalizedEmail },
      update: { reason },
      create: { email: normalizedEmail, reason },
    });
    return true;
  }
  return false;
}

/**
 * Enroll a contact in a sequence, skipping suppressed contacts. Idempotent per
 * (contact, sequence) active enrollment.
 */
export async function enrollContact(
  db: Db,
  contactId: string,
  sequenceId: string
): Promise<{ ok: boolean; reason?: string; enrollmentId?: string }> {
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return { ok: false, reason: "Contact not found." };
  if (contact.suppressed || (await isEmailSuppressed(db, contact.email))) {
    return { ok: false, reason: "Contact is suppressed — not enrolled." };
  }
  const existing = await db.sequenceEnrollment.findFirst({
    where: { contactId, sequenceId, status: "active" },
  });
  if (existing) return { ok: true, enrollmentId: existing.id };

  const enrollment = await db.sequenceEnrollment.create({
    data: { contactId, sequenceId, status: "active", currentStep: 0 },
  });
  await db.activity.create({
    data: {
      contactId,
      type: "sequence_enrolled",
      summary: "Enrolled in a sequence",
      meta: JSON.stringify({ sequenceId, enrollmentId: enrollment.id }),
    },
  });
  return { ok: true, enrollmentId: enrollment.id };
}
