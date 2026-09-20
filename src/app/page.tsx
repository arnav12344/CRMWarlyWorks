import { PageHeader } from "@/components/ui/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LayoutDashboard } from "lucide-react";

const STATS = [
  { label: "Contacts", value: "0" },
  { label: "Verified emails", value: "0" },
  { label: "Sent this week", value: "0" },
  { label: "Replies", value: "0" },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your daily action list and outreach at a glance."
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent>
              <p className="text-sm text-gray-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s follow-ups</CardTitle>
          <CardDescription>
            Business-day-aware reminders (Asia/Singapore) will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<LayoutDashboard className="h-5 w-5" />}
            title="Nothing to action yet"
            description="Import leads and start a sequence to see follow-ups and activity here."
          />
        </CardContent>
      </Card>
    </>
  );
}
