import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ListOrdered } from "lucide-react";

export default function SequencesPage() {
  return (
    <>
      <PageHeader
        title="Sequences"
        description="Multi-step follow-up cadences that auto-stop on reply."
        actions={<Button>New sequence</Button>}
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={<ListOrdered className="h-5 w-5" />}
            title="No sequences yet"
            description="Build a multi-step cadence with day offsets and stop-on-reply rules."
          />
        </CardContent>
      </Card>
    </>
  );
}
