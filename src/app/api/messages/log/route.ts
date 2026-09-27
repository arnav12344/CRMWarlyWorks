import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logSentEmail, type FollowUpChoice } from "@/lib/manualLog";
import { readMailConfig } from "@/lib/mail/config";

export const runtime = "nodejs";

const schema = z
  .object({
    contactId: z.string().min(1).optional(),
    email: z.string().max(320).optional(),
    fullName: z.string().max(200).optional(),
    orgName: z.string().max(200).optional(),
    subject: z.string().max(300),
    body: z.string().max(20000).optional(),
    /** ISO timestamp of when it was sent. Defaults to now. */
    sentAt: z.string().datetime({ offset: true }).optional(),
    pipelineStageId: z.string().min(1).nullable().optional(),
    followUp: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("default") }),
        z.object({ kind: z.literal("none") }),
        z.object({ kind: z.literal("date"), dueAt: z.string().datetime({ offset: true }) }),
      ])
      .optional(),
  })
  .refine((v) => v.contactId || v.email, { message: "Provide a contact or an email address." });

/**
 * POST /api/messages/log
 * Record an email the user already sent from their own mail app, so it's
 * tracked (replies, follow-ups, pipeline) like one sent from the CRM.
 * This never sends anything.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const d = parsed.data;

  const followUp: FollowUpChoice | undefined =
    d.followUp?.kind === "date"
      ? { kind: "date", dueAt: new Date(d.followUp.dueAt) }
      : d.followUp;

  const result = await logSentEmail(prisma, {
    contactId: d.contactId,
    email: d.email,
    fullName: d.fullName,
    orgName: d.orgName,
    subject: d.subject,
    body: d.body,
    sentAt: d.sentAt ? new Date(d.sentAt) : undefined,
    pipelineStageId: d.pipelineStageId ?? null,
    followUp,
    fromAddress: readMailConfig()?.fromAddress ?? null,
  });

  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "suppressed" ? 409 : 400;
    return NextResponse.json({ error: result.reason, code: result.code }, { status });
  }
  return NextResponse.json(result);
}
