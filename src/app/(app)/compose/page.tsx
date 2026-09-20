import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { ComposeWorkspace } from "./ComposeWorkspace";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const [contacts, templates, snippets, queue] = await Promise.all([
    prisma.contact.findMany({
      where: { email: { not: null }, suppressed: false },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        organization: { select: { name: true, city: true, country: true, contactType: { select: { name: true } } } },
      },
    }),
    prisma.template.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.snippet.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.emailMessage.findMany({
      where: { status: { in: ["draft", "queued", "approved"] }, direction: "outbound" },
      orderBy: { createdAt: "desc" },
      include: {
        contact: { select: { id: true, fullName: true, firstName: true, lastName: true, email: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Compose & Review"
        description="Draft personalized messages, preview the merge live, and approve everything before it 'sends'. Sends are simulated — no real email leaves the app."
      />
      <ComposeWorkspace
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
          contactType: c.organization?.contactType?.name ?? null,
        }))}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          subject: t.subject,
          body: t.body,
        }))}
        snippets={snippets.map((s) => ({ id: s.id, label: s.label, body: s.body }))}
        queue={queue.map((m) => ({
          id: m.id,
          status: m.status,
          subject: m.subject,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          contactId: m.contact.id,
          contactName:
            m.contact.fullName ||
            [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") ||
            m.contact.email ||
            "Unknown",
          contactEmail: m.contact.email,
        }))}
      />
    </>
  );
}
