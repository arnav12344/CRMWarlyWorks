import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { lastSyncedAt } from "@/lib/mail/inbox";
import { readMailConfig } from "@/lib/mail/config";
import { markRepliesSeen } from "@/lib/replies";
import { RepliesWorkspace } from "./RepliesWorkspace";

export const dynamic = "force-dynamic";

export default async function RepliesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const [inbound, followUps, stages, pipelineContacts, lastSync] = await Promise.all([
    prisma.emailMessage.findMany({
      where: { direction: "inbound", status: { in: ["replied", "optout", "autoreply", "bounce_notice"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        contact: {
          select: {
            id: true,
            fullName: true,
            firstName: true,
            email: true,
            pipelineStageId: true,
            organization: { select: { name: true } },
          },
        },
      },
    }),
    prisma.followUp.findMany({
      where: { status: "pending" },
      orderBy: { dueAt: "asc" },
      take: 100,
      include: { contact: { select: { id: true, fullName: true, email: true, organization: { select: { name: true } } } } },
    }),
    prisma.pipelineStage.findMany({ orderBy: { order: "asc" } }),
    prisma.contact.findMany({
      where: { pipelineStageId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 600,
      select: { id: true, fullName: true, firstName: true, email: true, pipelineStageId: true, suppressed: true, organization: { select: { name: true } } },
    }),
    lastSyncedAt().catch(() => null),
  ]);

  const name = (c: { fullName: string | null; firstName?: string | null; email: string | null }) =>
    c.fullName || c.firstName || c.email || "Unknown";

  // Opening this page clears the unread-reply badge in the sidebar.
  await markRepliesSeen(prisma).catch(() => 0);

  return (
    <>
      <PageHeader
        eyebrow="Step 4 of 4"
        title="Replies & pipeline"
        description="Replies, bounces and opt-outs are picked up from your Gmail inbox automatically every 10 minutes. Move people along your pipeline here."
      />
      <RepliesWorkspace
        initialTab={params.tab === "followups" ? "followups" : params.tab === "pipeline" ? "pipeline" : "replies"}
        mailConfigured={readMailConfig() !== null}
        lastSync={lastSync}
        stages={stages.map((s) => ({ id: s.id, name: s.name, isPositive: s.isPositive, isTerminal: s.isTerminal }))}
        replies={inbound.map((m) => ({
          id: m.id,
          kind: m.status,
          subject: m.subject ?? "",
          body: m.body ?? "",
          at: m.createdAt.toISOString(),
          contactId: m.contact.id,
          contactName: name(m.contact),
          contactEmail: m.contact.email,
          orgName: m.contact.organization?.name ?? null,
          stageId: m.contact.pipelineStageId,
        }))}
        followUps={followUps.map((f) => ({
          id: f.id,
          dueAt: f.dueAt.toISOString(),
          reason: f.reason,
          contactId: f.contact.id,
          contactName: name(f.contact),
          orgName: f.contact.organization?.name ?? null,
        }))}
        pipeline={pipelineContacts.map((c) => ({
          id: c.id,
          name: name(c),
          orgName: c.organization?.name ?? null,
          stageId: c.pipelineStageId,
          suppressed: c.suppressed,
        }))}
      />
    </>
  );
}
