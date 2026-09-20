import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PenSquare } from "lucide-react";

export default function ComposePage() {
  return (
    <>
      <PageHeader
        title="Compose"
        description="Personalize with templates and proof-point snippets. Review before every send."
        actions={<Button>New message</Button>}
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={<PenSquare className="h-5 w-5" />}
            title="Nothing to compose yet"
            description="Pick a contact and a template to draft a personalized message. Sends are simulated and tracked."
          />
        </CardContent>
      </Card>
    </>
  );
}
