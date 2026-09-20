import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Upload } from "lucide-react";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import"
        description="Upload a messy CSV/XLSX from a Google Maps scraper. We flatten nested JSON, redact secrets, and dedupe."
        actions={<Button>Upload file</Button>}
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={<Upload className="h-5 w-5" />}
            title="Import wizard coming online"
            description="The mapping and dedupe wizard is added in a later step. Drag a CSV or XLSX here to begin."
          />
        </CardContent>
      </Card>
    </>
  );
}
