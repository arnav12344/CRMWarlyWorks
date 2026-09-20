import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users } from "lucide-react";

export default function ContactsPage() {
  return (
    <>
      <PageHeader
        title="Contacts"
        description="People and organizations, grouped by editable contact types."
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No contacts yet"
            description="Contact types (schools, tuition centres, NGOs, and more) are fully editable data — add your own anytime."
          />
        </CardContent>
      </Card>
    </>
  );
}
