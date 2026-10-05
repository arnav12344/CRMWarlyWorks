/**
 * Outreach send engine (REAL email via the injected Mailer).
 *
 * `sendMessage` runs every safety check BEFORE touching the network:
 *   - message exists, is outbound, and has not already been sent/replied/bounced
 *   - contact has an email, is not suppressed (flag or suppression list)
 *   - not a reserved demo domain (.example/.invalid/.test/.localhost)
 *   - no unfilled fields: [firstName?], raw {{orgName}}, {typo}, [School name]
 *     (see src/lib/placeholders.ts) — an email with a missing field never sends
 *   - the sequence it belongs to has not been stopped (e.g. they replied)
 *   - the daily send limit (Singapore day) is not reached
 *   - a mail account is configured
 *   - a follow-up's first email has actually gone out
 * It then atomically claims the message (status -> "sending") so a double
 * click can never send twice, sends it, and records the Message-ID so replies
 * can be matched back.
 *
 * Follow-ups (sequence steps after the first, write-your-own follow-ups, and
 * "reply to my last email" sends) go out as REPLIES in the same thread:
 * "Re: <first subject>", In-Reply-To / References headers, and the earlier
 * emails quoted underneath like Gmail does. Your signature (Settings) is
 * appended to every email. There is no opt-out footer; a reply such as
 * "unsubscribe" or "remove me" still suppresses the contact automatically.
 *
 * Replies / bounces / opt-outs are detected from the real inbox in
 * src/lib/mail/inbound.ts, which reuses the helpers exported here.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { scheduleFollowUps, addBusinessDays, APP_TIMEZONE } from "./reminders";
import { normalizeEmail } from "./email";
import { dayRange } from "./time";
import { SEED_STAGE_NAME_BY_ROLE, type StageRole } from "./stageRoles";
import type { Mailer } from "./mail/mailer";
import { findPlaceholders } from "./placeholders";
import { buildEmailContent, replySubject, type QuotedMessage, type Signature } from "./mail/compose";

type Db = PrismaClient;

export const DEFAULT_DAILY_SEND_LIMIT = 50;

/** Statuses from which a message may be (re)sent. */
export const SENDABLE_STATUSES = ["draft", "queued", "approved", "failed"] as const;

export { findPlaceholders };

const RESERVED_TLDS = [".example", ".invalid", ".test", ".localhost"];

export function isReservedDomain(email: string): boolean {
  const lower = email.toLowerCase();
  return RESERVED_TLDS.some((tld) => lower.endsWith(tld));
}

/** Is this email on the suppression (do-not-contact) list? Case-insensitive. */
export async function isEmailSuppressed(db: Db, email: string | null | undefined): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = await db.suppression.findUnique({ where: { email: normalized } });
  return !!row;
}

/**
 * Move a contact to the stage carrying `role` (stages are editable data, so
 * resolve by role, falling back to the original seed name). With
 * `onlyForward`, a contact already in a positive/terminal stage (e.g. Meeting)
 * is left alone so automation never downgrades progress. No-op if no stage.
 */
export async function moveToStage(
  db: Db,
  contactId: string,
  role: StageRole,
  opts: { onlyForward?: boolean } = {}
): Promise<void> {
  if (opts.onlyForward) {
    const contact = await db.contact.findUnique({ where: { id: contactId } });
    if (contact?.pipelineStageId) {
      const current = await db.pipelineStage.findFirst({ where: { id: contact.pipelineStageId } });
      if (current && (current.isPositive || current.isTerminal)) return;
    }
  }
  let stage = await db.pipelineStage.findFirst({ where: { role } });
  if (!stage) {
    stage = await db.pipelineStage.findFirst({ where: { name: SEED_STAGE_NAME_BY_ROLE[role] } });
  }
  if (stage) {
    await db.contact.update({ where: { id: contactId }, data: { pipelineStageId: stage.id } });
  }
}

export type SendFailureCode =
  | "not_found"
  | "already_sent"
  | "suppressed"
  | "no_email"
  | "demo_address"
  | "placeholders"
  | "empty_subject"
  | "sequence_stopped"
  | "not_configured"
  | "daily_limit"
  | "in_progress"
  | "scheduled"
  | "waiting_parent"
  | "send_failed";

export interface SendResult {
  ok: boolean;
  code?: SendFailureCode;
  reason?: string;
  messageId?: string;
  followUpIds?: string[];
  sentToday?: number;
  dailyLimit?: number;
}

export interface SendOptions {
  mailer: Mailer | null;
  now?: Date;
  timeZone?: string;
  dailyLimit?: number;
  /** When true, a message scheduled for the future is skipped (used by the cron). */
  respectSchedule?: boolean;
  /** Appended to the email (HTML + text). Null/absent = no signature. */
  signature?: Signature | null;
}

/** The fields of an outbound email needed to thread a reply to it. */
interface ThreadRow {
  id: string;
  subject: string | null;
  body: string | null;
  sentAt: Date | null;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  fromAddress: string | null;
}

export type ReplyThread =
  | { kind: "new" }
  /** A follow-up whose first email hasn't been sent yet. */
  | { kind: "waiting" }
  | {
      kind: "reply";
      /** The latest sent email of the thread — the one this replies to. */
      target: ThreadRow;
      /** The thread oldest → newest, ending with `target`. */
      chain: ThreadRow[];
      /** "Re: <subject of the first email>". */
      subject: string;
    };

const MAX_THREAD_DEPTH = 25;

/**
 * Is this email a reply in an existing thread, and to which email?
 *  - linked follow-up (parentMessageId): replies to the latest sent email of
 *    {its parent + the parent's other follow-ups}; waits if the parent is unsent
 *  - sequence step: replies to the latest sent email of the same enrollment
 *  - anything else starts a new thread
 * The chain is walked back through each email's In-Reply-To for References.
 */
export async function resolveReplyThread(
  db: Db,
  message: { id: string; contactId: string; parentMessageId?: string | null; sequenceEnrollmentId?: string | null; subject?: string | null }
): Promise<ReplyThread> {
  const sentWhere = {
    contactId: message.contactId,
    direction: "outbound",
    sentAt: { not: null },
    id: { not: message.id },
  };
  const candidates: ThreadRow[] = [];

  if (message.parentMessageId) {
    const parent = await db.emailMessage.findUnique({ where: { id: message.parentMessageId } });
    if (parent && parent.direction !== "inbound") {
      if (!parent.sentAt) return { kind: "waiting" };
      candidates.push(parent);
      candidates.push(
        ...(await db.emailMessage.findMany({
          where: { ...sentWhere, parentMessageId: parent.id },
          orderBy: { sentAt: "desc" },
          take: 1,
        }))
      );
    }
  } else if (message.sequenceEnrollmentId) {
    candidates.push(
      ...(await db.emailMessage.findMany({
        where: { ...sentWhere, sequenceEnrollmentId: message.sequenceEnrollmentId },
        orderBy: { sentAt: "desc" },
        take: 1,
      }))
    );
  }

  const target = candidates
    .filter((m) => m.sentAt)
    .sort((a, b) => new Date(b.sentAt as Date).getTime() - new Date(a.sentAt as Date).getTime())[0];
  if (!target) return { kind: "new" };

  const chain: ThreadRow[] = [target];
  const seen = new Set([target.id]);
  let cur = target;
  while (chain.length < MAX_THREAD_DEPTH && cur.inReplyTo) {
    const prev = await db.emailMessage.findFirst({ where: { messageIdHeader: cur.inReplyTo, direction: "outbound" } });
    if (!prev || seen.has(prev.id)) break;
    chain.unshift(prev);
    seen.add(prev.id);
    cur = prev;
  }
  return { kind: "reply", target, chain, subject: replySubject(chain[0].subject ?? message.subject) };
}

/** Outbound messages sent during the local (Singapore) day containing `now`. */
export async function countSentToday(db: Db, now: Date = new Date(), timeZone: string = APP_TIMEZONE): Promise<number> {
  const { start, end } = dayRange(now, timeZone);
  return db.emailMessage.count({
    where: { direction: "outbound", sentAt: { gte: start, lt: end } },
  });
}

function fail(code: SendFailureCode, reason: string, extra: Partial<SendResult> = {}): SendResult {
  return { ok: false, code, reason, ...extra };
}

/** Send one outbound message for real. See the file header for the checks. */
export async function sendMessage(db: Db, messageId: string, opts: SendOptions): Promise<SendResult> {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? APP_TIMEZONE;
  const dailyLimit = opts.dailyLimit ?? DEFAULT_DAILY_SEND_LIMIT;

  const message = await db.emailMessage.findUnique({
    where: { id: messageId },
    include: { contact: true },
  });
  if (!message || message.direction === "inbound") return fail("not_found", "Message not found.");
  if (!(SENDABLE_STATUSES as readonly string[]).includes(message.status)) {
    return fail(
      message.status === "sending" ? "in_progress" : "already_sent",
      message.status === "sending" ? "This email is already being sent." : `Already ${message.status}.`
    );
  }

  const contact = message.contact;
  if (contact.suppressed || (await isEmailSuppressed(db, contact.email))) {
    return fail("suppressed", "Contact is suppressed (opted out or bounced) — send blocked.");
  }
  const to = normalizeEmail(contact.email);
  if (!to) return fail("no_email", "Contact has no email address.");
  if (isReservedDomain(to)) {
    return fail("demo_address", `${to} is a demo address (reserved domain) — not sending.`);
  }

  // Follow-ups go out as a reply in the first email's thread, so they keep its
  // subject ("Re: …") and must never go out before it.
  const thread = await resolveReplyThread(db, message);
  if (thread.kind === "waiting") {
    return fail("waiting_parent", "This follow-up goes out after its first email — send that one first.");
  }

  const subject = thread.kind === "reply" ? thread.subject : (message.subject ?? "").trim();
  if (!subject) return fail("empty_subject", "Subject is empty.");
  const placeholders = findPlaceholders(subject, message.body);
  if (placeholders.length) {
    return fail("placeholders", `Not sent: fill in the missing fields first (${placeholders.join(", ")}).`);
  }

  // The cron only releases messages whose scheduled time has arrived. (A user
  // clicking Send on a scheduled message sends it immediately on purpose.)
  if (opts.respectSchedule && message.scheduledFor && message.scheduledFor.getTime() > now.getTime()) {
    return fail("scheduled", `Scheduled for later (${message.scheduledFor.toISOString()}).`);
  }

  if (message.sequenceEnrollmentId) {
    const enrollment = await db.sequenceEnrollment.findFirst({ where: { id: message.sequenceEnrollmentId } });
    if (enrollment?.status === "stopped") {
      return fail(
        "sequence_stopped",
        `The sequence was stopped${enrollment.stoppedReason ? ` (${enrollment.stoppedReason})` : ""} — not sending this step.`
      );
    }
  }

  if (!opts.mailer) {
    return fail("not_configured", "Email not connected — add GMAIL_USER and GMAIL_APP_PASSWORD.");
  }

  const sentToday = await countSentToday(db, now, timeZone);
  if (sentToday >= dailyLimit) {
    return fail("daily_limit", `Daily limit reached (${sentToday}/${dailyLimit}). Sends resume tomorrow (Singapore time).`, {
      sentToday,
      dailyLimit,
    });
  }

  // Atomic claim: only one caller can move it into "sending".
  const claim = await db.emailMessage.updateMany({
    where: { id: messageId, status: { in: [...SENDABLE_STATUSES] } },
    data: { status: "sending", error: null },
  });
  if (claim.count === 0) return fail("in_progress", "This email is already being sent.");

  const mailer = opts.mailer;
  const reply = thread.kind === "reply" ? thread : null;
  const quoted: QuotedMessage[] = (reply?.chain ?? [])
    .filter((m) => (m.body ?? "").trim())
    .map((m) => ({
      body: m.body,
      sentAt: m.sentAt ? new Date(m.sentAt) : null,
      fromName: mailer.fromName,
      fromAddress: m.fromAddress || mailer.fromAddress,
    }));
  const content = buildEmailContent({ body: message.body, signature: opts.signature, thread: quoted, timeZone });
  const references = (reply?.chain ?? []).map((m) => m.messageIdHeader).filter((id): id is string => !!id);
  const inReplyTo = reply?.target.messageIdHeader ?? null;

  let sentId: string;
  try {
    const result = await mailer.send({
      to,
      subject,
      text: content.text,
      html: content.html,
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references.length ? { references } : {}),
    });
    sentId = result.messageId;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.emailMessage.update({ where: { id: messageId }, data: { status: "failed", error } });
    await db.activity.create({
      data: { contactId: contact.id, type: "email_failed", summary: `Send failed: ${subject} — ${error}` },
    });
    return fail("send_failed", `Send failed: ${error}`);
  }

  // The body stays as you wrote it; the signature and quoted history are
  // rebuilt at send time and never stored inside it.
  await db.emailMessage.update({
    where: { id: messageId },
    data: {
      status: "sent",
      sentAt: now,
      subject,
      toAddress: to,
      fromAddress: mailer.fromAddress,
      messageIdHeader: sentId,
      // For outbound mail: the Message-ID this email replied to (thread link).
      inReplyTo,
      scheduledFor: null,
      error: null,
    },
  });
  await db.activity.create({
    data: {
      contactId: contact.id,
      type: "email_sent",
      summary: reply ? `Sent (reply in thread): ${subject}` : `Sent: ${subject}`,
      meta: JSON.stringify({ messageId, to, inReplyTo }),
    },
  });
  await moveToStage(db, contact.id, "contacted", { onlyForward: true });

  // Release any "+N business days after this email" follow-ups the user wrote
  // upfront: now that this email actually went out, give each a concrete send
  // time and move it from "waiting" into the send queue. Absolute-date
  // follow-ups are already "queued" and untouched here.
  const waitingFollowUps = await db.emailMessage.findMany({
    where: { parentMessageId: messageId, status: "waiting", followUpAfterDays: { not: null } },
  });
  for (const f of waitingFollowUps) {
    await db.emailMessage.update({
      where: { id: f.id },
      data: {
        status: "queued",
        scheduledFor: addBusinessDays(now, (f.followUpAfterDays as number) ?? 0, timeZone),
      },
    });
  }

  // One-off emails get 2- and 3-business-day follow-up reminders. Sequence
  // emails don't — the sequence itself drafts the follow-up.
  const followUpIds: string[] = [];
  if (!message.sequenceEnrollmentId) {
    await db.followUp.updateMany({
      where: { contactId: contact.id, status: "pending" },
      data: { status: "done", completedAt: now },
    });
    for (const f of scheduleFollowUps(now, [2, 3], timeZone)) {
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

  return { ok: true, messageId, followUpIds, sentToday: sentToday + 1, dailyLimit };
}

export interface ReleaseResult {
  attempted: number;
  sent: number;
  failed: number;
  /** Held back because a field is missing (marked failed until you fix it). */
  blocked: number;
  hitLimit: boolean;
}

/**
 * Release scheduled messages that are now due, oldest first, until the daily
 * limit is reached or a per-run cap is hit. Called by the cron tick. Also
 * releases unscheduled queued/approved messages during the default send window
 * so a batch left as "next window" goes out then.
 */
export async function releaseScheduled(
  db: Db,
  opts: {
    mailer: Mailer | null;
    now?: Date;
    timeZone?: string;
    dailyLimit?: number;
    max?: number;
    includeWindow?: boolean;
    signature?: Signature | null;
  }
): Promise<ReleaseResult> {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? APP_TIMEZONE;
  const dailyLimit = opts.dailyLimit ?? DEFAULT_DAILY_SEND_LIMIT;
  const max = opts.max ?? 15;
  const result: ReleaseResult = { attempted: 0, sent: 0, failed: 0, blocked: 0, hitLimit: false };
  if (!opts.mailer) return result;

  const orConditions: Prisma.EmailMessageWhereInput[] = [{ scheduledFor: { lte: now } }];
  // During the weekly window, also flush anything explicitly parked for it.
  if (opts.includeWindow) orConditions.push({ scheduledFor: null });

  const due = await db.emailMessage.findMany({
    where: {
      direction: "outbound",
      status: { in: ["queued", "approved"] },
      AND: [
        { OR: orConditions },
        // A follow-up only once its first email has gone out (it's a reply to it).
        { OR: [{ parentMessageId: null }, { parentMessage: { is: { sentAt: { not: null } } } }] },
      ],
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: max,
    select: { id: true },
  });

  for (const m of due) {
    const remaining = dailyLimit - (await countSentToday(db, now, timeZone));
    if (remaining <= 0) {
      result.hitLimit = true;
      break;
    }
    result.attempted += 1;
    const res = await sendMessage(db, m.id, {
      mailer: opts.mailer,
      now,
      timeZone,
      dailyLimit,
      respectSchedule: true,
      signature: opts.signature,
    });
    if (res.ok) result.sent += 1;
    else if (res.code === "daily_limit") {
      result.hitLimit = true;
      break;
    } else if (res.code === "placeholders") {
      // A missing field won't fix itself: park it as failed with the reason so
      // it shows in Ready to send and stops being retried every tick. Editing
      // and saving it puts it back in the queue.
      result.blocked += 1;
      await db.emailMessage.updateMany({
        where: { id: m.id, status: { in: ["queued", "approved"] } },
        data: { status: "failed", error: res.reason ?? "Not sent: a field is missing." },
      });
    } else if (res.code !== "scheduled" && res.code !== "waiting_parent") result.failed += 1;
  }
  return result;
}

/** Set (or clear) the scheduled send time on a batch of queued messages. */
export async function scheduleMessages(
  db: Db,
  messageIds: string[],
  scheduledFor: Date | null
): Promise<number> {
  if (messageIds.length === 0) return 0;
  const res = await db.emailMessage.updateMany({
    where: { id: { in: messageIds }, direction: "outbound", status: { in: ["queued", "approved", "failed"] } },
    data: { scheduledFor },
  });
  return res.count;
}

/** Approve a message (kept for API compatibility; Send also counts as approval). */
export async function approveMessage(db: Db, messageId: string): Promise<SendResult> {
  const message = await db.emailMessage.findUnique({ where: { id: messageId } });
  if (!message) return fail("not_found", "Message not found.");
  await db.emailMessage.update({ where: { id: messageId }, data: { status: "approved" } });
  return { ok: true, messageId };
}

/** Skip: move a queued/failed message back to drafts (it leaves Ready to send). */
export async function rejectMessage(db: Db, messageId: string): Promise<SendResult> {
  const message = await db.emailMessage.findUnique({ where: { id: messageId } });
  if (!message) return fail("not_found", "Message not found.");
  if (!(SENDABLE_STATUSES as readonly string[]).includes(message.status)) {
    return fail("already_sent", `Already ${message.status}.`);
  }
  await db.emailMessage.update({ where: { id: messageId }, data: { status: "draft" } });
  await db.activity.create({
    data: {
      contactId: message.contactId,
      type: "email_skipped",
      summary: `Skipped (moved to drafts): ${message.subject ?? "(no subject)"}`,
    },
  });
  return { ok: true, messageId };
}

/** Stop all active enrollments for a contact with a reason. Returns their ids. */
export async function stopActiveEnrollments(db: Db, contactId: string, reason: string): Promise<string[]> {
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
 * Mark a contact suppressed, add its email to the Suppression list, stop its
 * sequences, and pull any unsent emails out of Ready to send.
 * Returns true when an email address was added to the list.
 */
export async function suppressContact(db: Db, contactId: string, reason: string): Promise<boolean> {
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return false;

  await db.contact.update({ where: { id: contactId }, data: { suppressed: true } });
  await stopActiveEnrollments(db, contactId, reason);
  await db.emailMessage.updateMany({
    where: { contactId, direction: "outbound", status: { in: ["queued", "approved", "failed"] } },
    data: { status: "draft" },
  });
  await db.activity.create({
    data: { contactId, type: "suppressed", summary: `Added to suppression list: ${reason}` },
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
 * Enroll a contact in a sequence, skipping suppressed contacts and contacts
 * without an email. Idempotent per (contact, sequence) active enrollment.
 */
export async function enrollContact(
  db: Db,
  contactId: string,
  sequenceId: string
): Promise<{ ok: boolean; reason?: string; enrollmentId?: string }> {
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return { ok: false, reason: "Contact not found." };
  if (!contact.email) return { ok: false, reason: "Contact has no email." };
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
