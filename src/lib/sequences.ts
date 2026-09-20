/**
 * Multi-step sequence (drip) engine.
 *
 * `advanceEnrollments()` walks active enrollments and, for any whose next step
 * is due (by business-day offset from enrollment), drafts the next
 * EmailMessage. Enrollments STOP automatically when the contact has replied,
 * bounced, or is suppressed — outreach never continues against someone who
 * asked to stop or whose mailbox is dead.
 *
 * Sending itself is SIMULATED elsewhere (see src/lib/outreach.ts); this engine
 * only produces draft/queued messages for the review queue.
 */

import type { PrismaClient } from "@prisma/client";
import { addBusinessDays, APP_TIMEZONE } from "./reminders";
import { buildMergeContext, renderEmail, type MergeSnippet } from "./merge";

/** Minimal Prisma surface used here — keeps the function unit-testable. */
type Db = PrismaClient;

export interface AdvanceResult {
  createdMessageIds: string[];
  stoppedEnrollmentIds: string[];
  advancedEnrollmentIds: string[];
}

/**
 * Reasons an enrollment auto-stops. Kept as data (strings), not an enum, to
 * match the rest of the schema.
 */
export type StopReason = "replied" | "bounced" | "suppressed";

/**
 * Determine whether an enrollment should stop, based on the contact's state
 * and message history. Returns the stop reason or null to continue.
 */
export function shouldStopEnrollment(params: {
  contactSuppressed: boolean;
  hasReplied: boolean;
  hasBounced: boolean;
}): StopReason | null {
  if (params.contactSuppressed) return "suppressed";
  if (params.hasReplied) return "replied";
  if (params.hasBounced) return "bounced";
  return null;
}

/**
 * Advance all active sequence enrollments. For each active enrollment:
 *  - stop it if the contact is suppressed / has replied / has bounced;
 *  - otherwise, if the next step's business-day offset is due, draft the
 *    next EmailMessage and increment currentStep (completing the enrollment
 *    when the last step is drafted).
 *
 * `now` is injectable for testing. Messages are created as status "queued" so
 * they land in the review-before-send queue.
 */
export async function advanceEnrollments(
  db: Db,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE
): Promise<AdvanceResult> {
  const result: AdvanceResult = {
    createdMessageIds: [],
    stoppedEnrollmentIds: [],
    advancedEnrollmentIds: [],
  };

  const enrollments = await db.sequenceEnrollment.findMany({
    where: { status: "active" },
    include: {
      contact: {
        include: {
          organization: true,
          messages: true,
        },
      },
      sequence: {
        include: {
          steps: {
            orderBy: { order: "asc" },
            include: { template: true },
          },
        },
      },
    },
  });

  // Load suppression list once for the emails in play.
  const emails = enrollments
    .map((e) => e.contact.email)
    .filter((e): e is string => !!e);
  const suppressedRows = emails.length
    ? await db.suppression.findMany({ where: { email: { in: emails } } })
    : [];
  const suppressedSet = new Set(suppressedRows.map((s) => s.email.toLowerCase()));

  for (const enrollment of enrollments) {
    const contact = enrollment.contact;
    const emailSuppressed =
      !!contact.email && suppressedSet.has(contact.email.toLowerCase());
    const hasReplied =
      contact.messages.some((m) => m.status === "replied") ||
      contact.messages.some((m) => m.repliedAt != null);
    const hasBounced =
      contact.messages.some((m) => m.status === "bounced") ||
      contact.messages.some((m) => m.bouncedAt != null);

    const stop = shouldStopEnrollment({
      contactSuppressed: contact.suppressed || emailSuppressed,
      hasReplied,
      hasBounced,
    });

    if (stop) {
      await db.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "stopped", stoppedReason: stop },
      });
      await db.activity.create({
        data: {
          contactId: contact.id,
          type: "sequence_stopped",
          summary: `Sequence "${enrollment.sequence.name}" stopped: ${stop}`,
        },
      });
      result.stoppedEnrollmentIds.push(enrollment.id);
      continue;
    }

    const steps = enrollment.sequence.steps;
    const nextStep = steps[enrollment.currentStep];
    if (!nextStep) {
      // No more steps — mark complete.
      await db.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "completed" },
      });
      continue;
    }

    // Due when enrolledAt + dayOffset business days <= now.
    const dueAt = addBusinessDays(enrollment.enrolledAt, nextStep.dayOffset, timeZone);
    if (dueAt.getTime() > now.getTime()) {
      continue; // not due yet
    }

    const template = nextStep.template;
    const snippets: MergeSnippet[] = [];
    const context = buildMergeContext({
      firstName: contact.firstName,
      lastName: contact.lastName,
      fullName: contact.fullName,
      title: contact.title,
      email: contact.email,
      organization: contact.organization
        ? {
            name: contact.organization.name,
            city: contact.organization.city,
            country: contact.organization.country,
          }
        : null,
    });
    const rendered = renderEmail(
      { subject: template?.subject ?? "", body: template?.body ?? "" },
      context,
      snippets
    );

    const message = await db.emailMessage.create({
      data: {
        contactId: contact.id,
        sequenceEnrollmentId: enrollment.id,
        templateId: template?.id ?? null,
        direction: "outbound",
        subject: rendered.subject,
        body: rendered.body,
        status: "queued",
      },
    });
    result.createdMessageIds.push(message.id);

    const isLastStep = enrollment.currentStep + 1 >= steps.length;
    await db.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: {
        currentStep: enrollment.currentStep + 1,
        status: isLastStep ? "completed" : "active",
      },
    });
    await db.activity.create({
      data: {
        contactId: contact.id,
        type: "sequence_step_queued",
        summary: `Queued step ${nextStep.order + 1} of "${enrollment.sequence.name}"`,
      },
    });
    result.advancedEnrollmentIds.push(enrollment.id);
  }

  return result;
}
