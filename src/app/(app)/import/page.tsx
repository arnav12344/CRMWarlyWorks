import { PageHeader } from "@/components/ui/PageHeader";
import { ImportWizard } from "./ImportWizard";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import"
        description="Upload a messy CSV/XLSX from a Google Maps scraper. We flatten nested JSON, redact secrets, dedupe organizations, and split out contacts."
      />
      <ImportWizard />
    </>
  );
}
