import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";
import { ContactDetail, type TimelineEvent } from "./ContactDetail";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      organization: {
        include: { contactType: { select: { name: true } } },
      },
      pipelineStage: true,
      verifications: { orderBy: { checkedAt: "desc" } },
      messages: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" } },
      followUps: { orderBy: { dueAt: "asc" } },
      enrollments: {
        include: { sequence: { select: { name: true } } },
        orderBy: { enrolledAt: "desc" },
      },
    },
  });

  if (!contact) notFound();

  const normalizedContactEmail = normalizeEmail(contact.email);
  const [stages, suppression] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: { order: "asc" } }),
    normalizedContactEmail
      ? prisma.suppression.findUnique({ where: { email: normalizedContactEmail } })
      : Promise.resolve(null),
  ]);

  // Build a merged chronological timeline.
  const events: TimelineEvent[] = [];
  for (const a of contact.activities) {
    events.push({
      kind: "activity",
      at: a.createdAt.toISOString(),
      title: a.summary ?? a.type,
      tag: a.type,
    });
  }
  for (const m of contact.messages) {
    if (m.sentAt) {
      events.push({ kind: "message", at: m.sentAt.toISOString(), title: `Sent: ${m.subject ?? "(no subject)"}`, tag: "sent" });
    }
    if (m.openedAt) {
      events.push({ kind: "message", at: m.openedAt.toISOString(), title: `Opened: ${m.subject ?? ""}`, tag: "opened" });
    }
    if (m.repliedAt) {
      events.push({ kind: "message", at: m.repliedAt.toISOString(), title: `Replied: ${m.subject ?? ""}`, tag: "replied" });
    }
    if (m.bouncedAt) {
      events.push({ kind: "message", at: m.bouncedAt.toISOString(), title: `Bounced: ${m.subject ?? ""}`, tag: "bounced" });
    }
  }
  for (const f of contact.followUps) {
    events.push({
      kind: "followup",
      at: f.dueAt.toISOString(),
      title: `Follow-up ${f.status === "done" ? "done" : "due"}: ${f.reason ?? ""}`,
      tag: f.status,
    });
  }
  for (const v of contact.verifications) {
    events.push({
      kind: "verification",
      at: v.checkedAt.toISOString(),
      title: `Verified via ${v.provider}: ${v.result ?? "unknown"}`,
      tag: v.result ?? "unknown",
    });
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const name =
    contact.fullName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    contact.email ||
    "Unknown contact";

  return (
    <ContactDetail
      contact={{
        id: contact.id,
        name,
        email: contact.email,
        title: contact.title,
        orgName: contact.organization?.name ?? null,
        contactType: contact.organization?.contactType?.name ?? null,
        stageId: contact.pipelineStageId,
        stageName: contact.pipelineStage?.name ?? null,
        suppressed: contact.suppressed || !!suppression,
        verificationConsensus: contact.verificationConsensus,
        mailboxType: contact.mailboxType,
        likelyIndividual: contact.likelyIndividual,
      }}
      stages={stages.map((s) => ({ id: s.id, name: s.name }))}
      verifications={contact.verifications.map((v) => ({
        id: v.id,
        provider: v.provider,
        result: v.result,
        quality: v.quality,
        checkedAt: v.checkedAt.toISOString(),
      }))}
      enrollments={contact.enrollments.map((e) => ({
        id: e.id,
        sequenceName: e.sequence.name,
        status: e.status,
        currentStep: e.currentStep,
        stoppedReason: e.stoppedReason,
      }))}
      openFollowUps={contact.followUps
        .filter((f) => f.status === "pending")
        .map((f) => ({
          id: f.id,
          dueAt: f.dueAt.toISOString(),
          reason: f.reason,
        }))}
      sentMessages={contact.messages
        .filter((m) => m.status === "sent" || m.status === "replied" || m.status === "bounced")
        .map((m) => ({
          id: m.id,
          subject: m.subject,
          status: m.status,
        }))}
      timeline={events}
    />
  );
}
