/**
 * Multi-step sequence (drip) engine.
 *
 * `advanceEnrollments()` walks active enrollments and, when the next step is
 * due, drafts its EmailMessage into "Ready to send" (status "queued"). Nothing
 * is sent automatically — the user always clicks Send.
 *
 * Timing: step 1 is due `dayOffset` business days after enrollment. Later
 * steps are due (their dayOffset − previous dayOffset) business days after the
 * PREVIOUS step was actually sent, and never while the previous step is still
 * sitting unsent — so a follow-up can't jump ahead of the first email.
 *
 * Steps after the first are sent as replies in the first email's thread, so
 * they're drafted with its subject ("Re: <first subject>"); the step
 * template's own subject is only used for the first email.
 *
 * Enrollments STOP automatically when the contact replied, bounced, or is
 * suppressed.
 */

import type { PrismaClient } from "@prisma/client";
import { addBusinessDays, APP_TIMEZONE } from "./reminders";
import { buildMergeContext, renderEmail, type MergeSnippet } from "./merge";
import { normalizeEmail } from "./email";
import { replySubject } from "./mail/compose";

type Db = PrismaClient;

export interface AdvanceResult {
  createdMessageIds: string[];
  stoppedEnrollmentIds: string[];
  advancedEnrollmentIds: string[];
}

export type StopReason = "replied" | "bounced" | "suppressed";

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

export interface AdvanceOptions {
  /** Only consider these enrollments (e.g. the ones just created). */
  enrollmentIds?: string[];
}

export async function advanceEnrollments(
  db: Db,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE,
  opts: AdvanceOptions = {}
): Promise<AdvanceResult> {
  const result: AdvanceResult = {
    createdMessageIds: [],
    stoppedEnrollmentIds: [],
    advancedEnrollmentIds: [],
  };

  const where: Record<string, unknown> = { status: "active" };
  if (opts.enrollmentIds) where.id = { in: opts.enrollmentIds };

  const enrollments = await db.sequenceEnrollment.findMany({
    where,
    include: {
      contact: { include: { organization: true, messages: true } },
      sequence: {
        include: { steps: { orderBy: { order: "asc" }, include: { template: true } } },
      },
    },
  });
  if (enrollments.length === 0) return result;

  // Snippet library, so {{snippet:Label}} resolves in sequence emails too.
  const snippetRows = await db.snippet.findMany();
  const snippets: MergeSnippet[] = snippetRows.map((s) => ({ label: s.label, body: s.body }));

  // Suppression list for the emails in play (normalized, case-insensitive).
  const emails = [
    ...new Set(
      enrollments
        .map((e) => normalizeEmail(e.contact.email))
        .filter((e): e is string => !!e)
    ),
  ];
  const suppressedRows = emails.length
    ? await db.suppression.findMany({ where: { email: { in: emails } } })
    : [];
  const suppressedSet = new Set(suppressedRows.map((s) => s.email.toLowerCase()));

  for (const enrollment of enrollments) {
    const contact = enrollment.contact;
    const normalized = normalizeEmail(contact.email);
    const emailSuppressed = !!normalized && suppressedSet.has(normalized);
    const hasReplied = contact.messages.some((m) => m.status === "replied" || m.repliedAt != null);
    const hasBounced = contact.messages.some((m) => m.status === "bounced" || m.bouncedAt != null);

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
      await db.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "completed" } });
      continue;
    }

    // When is the next step due?
    let dueAt: Date | null;
    const prevStep = enrollment.currentStep > 0 ? steps[enrollment.currentStep - 1] : null;
    const prevMessage = contact.messages
      .filter((m) => m.sequenceEnrollmentId === enrollment.id && m.direction !== "inbound")
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];
    if (prevStep && prevMessage) {
      dueAt = prevMessage.sentAt
        ? addBusinessDays(new Date(prevMessage.sentAt), Math.max(0, nextStep.dayOffset - prevStep.dayOffset), timeZone)
        : null; // previous step not sent yet — wait
    } else {
      dueAt = addBusinessDays(enrollment.enrolledAt, nextStep.dayOffset, timeZone);
    }
    if (!dueAt || dueAt.getTime() > now.getTime()) continue;

    const template = nextStep.template;
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

    // Later steps reply in the thread the first sent step started.
    const threadRoot =
      enrollment.currentStep > 0
        ? contact.messages
            .filter((m) => m.sequenceEnrollmentId === enrollment.id && m.direction !== "inbound" && m.sentAt)
            .sort((a, b) => new Date(a.sentAt as Date).getTime() - new Date(b.sentAt as Date).getTime())[0]
        : undefined;
    const subject = threadRoot?.subject ? replySubject(threadRoot.subject) : rendered.subject;

    const message = await db.emailMessage.create({
      data: {
        contactId: contact.id,
        sequenceEnrollmentId: enrollment.id,
        templateId: template?.id ?? null,
        direction: "outbound",
        toAddress: normalized,
        subject,
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
        summary: `Step ${nextStep.order + 1} of "${enrollment.sequence.name}" is ready to send`,
      },
    });
    result.advancedEnrollmentIds.push(enrollment.id);
  }

  return result;
}
