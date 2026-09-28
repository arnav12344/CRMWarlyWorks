/**
 * Write-your-own auto-follow-ups.
 *
 * A follow-up is just an outbound EmailMessage linked to its first email via
 * `parentMessageId`, that the cron's `releaseScheduled` will auto-send once its
 * `scheduledFor` arrives — subject to every `sendMessage` guard (suppression,
 * daily limit, placeholders). There are two kinds:
 *
 *  - "afterDays": send N business days after the FIRST email actually sends.
 *    Stored as status "waiting" with `followUpAfterDays` set and no
 *    `scheduledFor`; `sendMessage` resolves it to a concrete time when the
 *    parent sends, flipping it to "queued". This guarantees a follow-up can
 *    never precede the first email.
 *  - "date": send at a specific instant. Stored as "queued" with `scheduledFor`
 *    already set.
 *
 * The opt-out footer is NOT added here — `sendMessage` appends it at send time.
 */

import type { PrismaClient } from "@prisma/client";

type Db = PrismaClient;

export type FollowUpWhen =
  | { kind: "afterDays"; days: number }
  | { kind: "date"; dateISO: string };

export interface FollowUpInput {
  subject: string;
  body: string;
  when: FollowUpWhen;
}

export interface ScheduleFollowUpsInput {
  firstMessageId: string;
  contactId: string;
  toAddress: string | null;
  followUps: FollowUpInput[];
  /** Reject dates before now (minus a small skew). Defaults to now. */
  now?: Date;
}

export type ScheduleFollowUpsResult =
  | { ok: true; createdIds: string[] }
  | { ok: false; code: "invalid"; reason: string };

/** Allow a little clock skew between the browser and server. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_FOLLOWUPS = 10;
const MAX_AFTER_DAYS = 60;

function fail(reason: string): ScheduleFollowUpsResult {
  return { ok: false, code: "invalid", reason };
}

/**
 * Validate a follow-up plan without touching the DB. Exported so the API and
 * UI can share the same rules.
 */
export function validateFollowUps(followUps: FollowUpInput[], now: Date = new Date()): { ok: true } | { ok: false; reason: string } {
  if (followUps.length > MAX_FOLLOWUPS) {
    return { ok: false, reason: `Too many follow-ups (max ${MAX_FOLLOWUPS}).` };
  }
  for (const [i, f] of followUps.entries()) {
    const n = i + 1;
    const subject = f.subject?.trim() ?? "";
    if (!subject) return { ok: false, reason: `Follow-up ${n}: add a subject.` };
    if (subject.length > 300) return { ok: false, reason: `Follow-up ${n}: subject is too long (max 300).` };
    if ((f.body?.length ?? 0) > 20000) return { ok: false, reason: `Follow-up ${n}: body is too long.` };
    if (f.when.kind === "afterDays") {
      if (!Number.isInteger(f.when.days) || f.when.days < 1 || f.when.days > MAX_AFTER_DAYS) {
        return { ok: false, reason: `Follow-up ${n}: days must be between 1 and ${MAX_AFTER_DAYS}.` };
      }
    } else {
      const t = new Date(f.when.dateISO).getTime();
      if (Number.isNaN(t)) return { ok: false, reason: `Follow-up ${n}: the date isn't valid.` };
      if (t < now.getTime() - FUTURE_SKEW_MS) return { ok: false, reason: `Follow-up ${n}: the date is in the past.` };
    }
  }
  return { ok: true };
}

/**
 * Create the follow-up EmailMessage rows for a first email. Order is preserved.
 * Returns the created ids, or a typed validation error (nothing is written on
 * failure).
 */
export async function scheduleFollowUpEmails(
  db: Db,
  input: ScheduleFollowUpsInput
): Promise<ScheduleFollowUpsResult> {
  const now = input.now ?? new Date();
  const valid = validateFollowUps(input.followUps, now);
  if (!valid.ok) return fail(valid.reason);

  const createdIds: string[] = [];
  for (const f of input.followUps) {
    const subject = f.subject.trim();
    const body = f.body?.trim() ? f.body.trim().slice(0, 20000) : "";
    const base = {
      contactId: input.contactId,
      parentMessageId: input.firstMessageId,
      direction: "outbound" as const,
      toAddress: input.toAddress,
      subject,
      body,
    };

    const data =
      f.when.kind === "afterDays"
        ? { ...base, status: "waiting", followUpAfterDays: f.when.days, scheduledFor: null }
        : { ...base, status: "queued", scheduledFor: new Date(f.when.dateISO), followUpAfterDays: null };

    const created = await db.emailMessage.create({ data });
    createdIds.push(created.id as string);
  }

  return { ok: true, createdIds };
}
