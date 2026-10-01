import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { countSentToday } from "@/lib/outreach";
import { getDailySendLimit } from "@/lib/verify/settings";
import { readMailConfig } from "@/lib/mail/config";
import { getSignature } from "@/lib/mail/signatureStore";
import { SendWorkspace } from "./SendWorkspace";
import { LogSentEmailDialog } from "@/components/LogSentEmailDialog";

export const dynamic = "force-dynamic";

export default async function SendPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; contactId?: string }>;
}) {
  const params = await searchParams;
  const [queue, contacts, templates, snippets, sequences, contactTypes, stages, sentToday, dailyLimit, signature] =
    await Promise.all([
      prisma.emailMessage.findMany({
        where: { direction: "outbound", status: { in: ["queued", "approved", "failed", "sending"] } },
        orderBy: { createdAt: "asc" },
        take: 300,
        include: {
          contact: {
            select: { id: true, fullName: true, firstName: true, lastName: true, email: true, organization: { select: { name: true } } },
          },
          sequenceEnrollment: {
            select: {
              sequence: { select: { name: true } },
              // Any step already sent → this step goes out as a reply in that thread.
              messages: { where: { direction: "outbound", sentAt: { not: null } }, select: { id: true }, take: 1 },
            },
          },
        },
      }),
      prisma.contact.findMany({
        where: { email: { not: null }, suppressed: false },
        orderBy: { createdAt: "desc" },
        take: 2000,
        include: {
          organization: { select: { name: true, city: true, country: true, contactTypeId: true, contactType: { select: { name: true } } } },
          _count: { select: { messages: { where: { direction: "outbound", sentAt: { not: null } } } } },
          messages: {
            where: { direction: "outbound", sentAt: { not: null } },
            orderBy: { sentAt: "desc" },
            take: 1,
            select: { subject: true, sentAt: true },
          },
        },
      }),
      prisma.template.findMany({ orderBy: { name: "asc" } }),
      prisma.snippet.findMany({ orderBy: { label: "asc" } }),
      prisma.sequence.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        include: { steps: { orderBy: { order: "asc" }, include: { template: { select: { name: true, subject: true, body: true } } } } },
      }),
      prisma.contactType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      prisma.pipelineStage.findMany({ orderBy: { order: "asc" } }),
      countSentToday(prisma),
      getDailySendLimit(),
      getSignature(),
    ]);

  return (
    <>
      <PageHeader
        eyebrow="Step 3 of 4"
        title="Write & send"
        description="Pick leads, choose a template or sequence, preview every personalized email, then send. Nothing goes out until you click Send. Sent one from Gmail yourself? Log it so replies and follow-ups are tracked."
        actions={<LogSentEmailDialog stages={stages.map((s) => ({ id: s.id, name: s.name }))} size="lg" />}
      />
      <SendWorkspace
        initialTab={params.tab === "new" || (queue.length === 0 && params.tab !== "ready") ? "new" : "ready"}
        preselectContactId={params.contactId ?? null}
        mailConfigured={readMailConfig() !== null}
        sentToday={sentToday}
        dailyLimit={dailyLimit}
        signatureText={signature?.text ?? null}
        queue={queue.map((m) => ({
          id: m.id,
          status: m.status,
          subject: m.subject ?? "",
          body: m.body ?? "",
          error: m.error,
          contactId: m.contact.id,
          contactName:
            m.contact.fullName || [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || m.contact.email || "Unknown",
          contactEmail: m.contact.email,
          orgName: m.contact.organization?.name ?? null,
          sequenceName: m.sequenceEnrollment?.sequence.name ?? null,
          scheduledFor: m.scheduledFor ? m.scheduledFor.toISOString() : null,
          isReply: !!m.parentMessageId || (m.sequenceEnrollment?.messages.length ?? 0) > 0,
        }))}
        contacts={contacts.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          fullName: c.fullName,
          title: c.title,
          email: c.email,
          orgName: c.organization?.name ?? null,
          city: c.organization?.city ?? null,
          country: c.organization?.country ?? null,
          contactTypeId: c.organization?.contactTypeId ?? null,
          contactType: c.organization?.contactType?.name ?? null,
          stageId: c.pipelineStageId,
          verification: c.verificationConsensus,
          isRoleInbox: c.isRoleInbox,
          sentCount: c._count.messages,
          lastSentSubject: c.messages[0]?.subject ?? null,
          lastSentAt: c.messages[0]?.sentAt ? c.messages[0].sentAt.toISOString() : null,
        }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, body: t.body }))}
        snippets={snippets.map((s) => ({ id: s.id, label: s.label, body: s.body }))}
        sequences={sequences.map((s) => ({
          id: s.id,
          name: s.name,
          steps: s.steps.map((st) => ({
            order: st.order,
            dayOffset: st.dayOffset,
            templateName: st.template?.name ?? "(no template)",
            subject: st.template?.subject ?? "",
            body: st.template?.body ?? "",
          })),
        }))}
        contactTypes={contactTypes.map((t) => ({ id: t.id, name: t.name }))}
        stages={stages.map((s) => ({ id: s.id, name: s.name }))}
      />
    </>
  );
}
