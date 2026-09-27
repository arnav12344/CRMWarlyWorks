import { PageHeader } from "@/components/ui/PageHeader";
import { ImportWizard } from "./ImportWizard";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Step 1 of 4 · Add leads"
        title="Import leads"
        description="Upload a CSV/XLSX, even a messy Google Maps scraper export. We flatten nested JSON, strip any API keys or passwords, merge duplicates, and split out contacts."
      />
      <ImportWizard />
    </>
  );
}
