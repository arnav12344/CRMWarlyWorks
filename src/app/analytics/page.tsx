import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Funnel metrics: contacted, opened, replied, meetings, and won."
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title="No data to chart yet"
            description="Once you start sending, your outreach funnel and reply rates appear here."
          />
        </CardContent>
      </Card>
    </>
  );
}
