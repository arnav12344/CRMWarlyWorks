import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShieldCheck } from "lucide-react";

export default function VerificationPage() {
  return (
    <>
      <PageHeader
        title="Verification"
        description="Cross-check email deliverability with MillionVerifier and ZeroBounce. Falls back to manual/mock verification when API keys are absent."
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Verification queue is empty"
            description="Queue addresses from your contacts to check quality, role inboxes, and catch-all domains."
          />
        </CardContent>
      </Card>
    </>
  );
}
