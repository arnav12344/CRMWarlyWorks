import { PageHeader } from "@/components/ui/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Contact types, pipeline stages, and encrypted provider API keys."
      />
      <Card>
        <CardHeader>
          <CardTitle>Provider API keys</CardTitle>
          <CardDescription>
            Keys for MillionVerifier and ZeroBounce are encrypted at rest
            (AES-256-GCM) and never exposed to the client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<SettingsIcon className="h-5 w-5" />}
            title="Configuration coming online"
            description="Manage editable contact types, pipeline stages, and secure API keys from here."
          />
        </CardContent>
      </Card>
    </>
  );
}
