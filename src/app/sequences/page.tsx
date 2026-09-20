import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { SequencesWorkspace } from "./SequencesWorkspace";

export const dynamic = "force-dynamic";

export default async function SequencesPage() {
  const [templates, snippets, sequences] = await Promise.all([
    prisma.template.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.snippet.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.sequence.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        steps: { orderBy: { order: "asc" }, include: { template: true } },
        _count: { select: { enrollments: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Sequences & Templates"
        description="Build reusable templates and proof-point snippets, then chain them into multi-step cadences that auto-stop on reply, bounce, or opt-out."
      />
      <SequencesWorkspace
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          subject: t.subject,
          body: t.body,
        }))}
        snippets={snippets.map((s) => ({
          id: s.id,
          label: s.label,
          category: s.category,
          body: s.body,
        }))}
        sequences={sequences.map((s) => ({
          id: s.id,
          name: s.name,
          isActive: s.isActive,
          enrollments: s._count.enrollments,
          steps: s.steps.map((st) => ({
            id: st.id,
            order: st.order,
            dayOffset: st.dayOffset,
            stopOnReply: st.stopOnReply,
            templateId: st.templateId,
            templateName: st.template?.name ?? null,
          })),
        }))}
      />
    </>
  );
}
