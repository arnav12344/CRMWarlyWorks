import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Target } from "lucide-react";

export default function LeadsPage() {
  return (
    <>
      <PageHeader
        title="Leads"
        description="Search, filter, and segment prospects before you reach out."
        actions={<Button>New segment</Button>}
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title="No leads yet"
            description="Import a Google Maps scraper CSV/XLSX to populate your lead list."
          />
        </CardContent>
      </Card>
    </>
  );
}
