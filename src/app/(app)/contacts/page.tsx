import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Users } from "lucide-react";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      organization: { select: { name: true, contactType: { select: { name: true } } } },
      pipelineStage: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Contacts"
        description="People and organizations, grouped by editable contact types. Click a contact to see the full timeline."
      />
      {contacts.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No contacts yet"
              description="Contact types (schools, tuition centres, NGOs, and more) are fully editable data — add your own anytime, then import leads."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Organization</TH>
                <TH>Type</TH>
                <TH>Stage</TH>
                <TH>Email</TH>
              </TR>
            </THead>
            <TBody>
              {contacts.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link
                      href={`/contacts/${c.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {c.fullName ||
                        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                        c.email ||
                        "Unknown"}
                    </Link>
                  </TD>
                  <TD>{c.organization?.name ?? "—"}</TD>
                  <TD>
                    {c.organization?.contactType?.name ? (
                      <Badge tone="brand">{c.organization.contactType.name}</Badge>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>{c.pipelineStage?.name ? <Badge>{c.pipelineStage.name}</Badge> : "—"}</TD>
                  <TD className="text-gray-500">{c.email ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
