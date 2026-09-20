import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { LeadsTable, type LeadRow } from "./LeadsTable";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const [contacts, contactTypes, stages, sequences, suppressions] = await Promise.all([
    prisma.contact.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: {
        organization: {
          select: { name: true, city: true, contactType: { select: { id: true, name: true } } },
        },
        pipelineStage: { select: { id: true, name: true } },
        messages: {
          where: { direction: "outbound" },
          select: { status: true, sentAt: true, repliedAt: true },
        },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, summary: true },
        },
      },
    }),
    prisma.contactType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.pipelineStage.findMany({ orderBy: { order: "asc" } }),
    prisma.sequence.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.suppression.findMany({ select: { email: true } }),
  ]);

  const suppressedEmails = new Set(suppressions.map((s) => s.email.toLowerCase()));

  const rows: LeadRow[] = contacts.map((c) => {
    const sent = c.messages.filter((m) => m.sentAt).length;
    const replied = c.messages.filter((m) => m.repliedAt).length;
    const isSuppressed =
      c.suppressed || (c.email ? suppressedEmails.has(c.email.toLowerCase()) : false);
    return {
      id: c.id,
      name:
        c.fullName ||
        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
        c.email ||
        "Unknown",
      email: c.email,
      orgName: c.organization?.name ?? null,
      city: c.organization?.city ?? null,
      contactTypeId: c.organization?.contactType?.id ?? null,
      contactType: c.organization?.contactType?.name ?? null,
      stageId: c.pipelineStage?.id ?? null,
      stage: c.pipelineStage?.name ?? null,
      verification: c.verificationConsensus,
      suppressed: isSuppressed,
      sent,
      replied,
      lastActivity: c.activities[0]?.createdAt?.toISOString() ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Leads"
        description="Apollo-style prospecting table. Filter, save segments, and bulk-enroll or verify. Suppressed contacts are flagged and never messaged."
      />
      <LeadsTable
        rows={rows}
        contactTypes={contactTypes.map((t) => ({ id: t.id, name: t.name }))}
        stages={stages.map((s) => ({ id: s.id, name: s.name }))}
        sequences={sequences.map((s) => ({ id: s.id, name: s.name }))}
      />
    </>
  );
}
