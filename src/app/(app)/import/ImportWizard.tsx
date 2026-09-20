"use client";

import * as React from "react";
import Link from "next/link";
import {
  Upload,
  FileSpreadsheet,
  ShieldAlert,
  Braces,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { MAPPABLE_FIELDS, type MappableField } from "@/lib/import/mapping";

interface ContactType {
  id: string;
  name: string;
  color: string;
}

interface PreviewResponse {
  filename: string;
  rowCount: number;
  headers: string[];
  discoveredFields: string[];
  mappingColumns: string[];
  autoMapping: Partial<Record<MappableField, string | null>>;
  businessCount: number;
  rowsWithNestedJson: number;
  redactedSecretCount: number;
  sample: Array<{ name?: string; website?: string; email?: string; city?: string }>;
}

interface RunSummary {
  batchId: string;
  filename: string;
  rowCount: number;
  orgCount: number;
  contactCount: number;
  redactedSecretCount: number;
  rowsWithNestedJson: number;
  sample: Array<{ name: string; email?: string; city?: string; domain?: string }>;
}

const FIELD_LABELS: Record<MappableField, string> = {
  orgName: "Organization name",
  orgWebsite: "Website",
  orgPhone: "Phone",
  orgAddress: "Address",
  orgCity: "City",
  orgCountry: "Country",
  orgCategories: "Categories",
  contactEmail: "Contact email",
  contactFullName: "Contact full name",
  contactTitle: "Contact title",
};

const STEPS = ["Upload", "Preview", "Map columns", "Import"] as const;

export function ImportWizard() {
  const [step, setStep] = React.useState(0);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = React.useState<
    Partial<Record<MappableField, string | null>>
  >({});
  const [contactTypes, setContactTypes] = React.useState<ContactType[]>([]);
  const [contactTypeId, setContactTypeId] = React.useState<string>("");
  const [summary, setSummary] = React.useState<RunSummary | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fetch("/api/contact-types")
      .then((r) => r.json())
      .then((d) => setContactTypes(d.contactTypes ?? []))
      .catch(() => setContactTypes([]));
  }, []);

  function pickFile(f: File | null) {
    setError(null);
    setFile(f);
  }

  async function runPreview() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mode", "preview");
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed.");
      setPreview(data as PreviewResponse);
      setMapping(data.autoMapping ?? {});
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mode", "run");
      form.set(
        "config",
        JSON.stringify({
          mapping,
          contactTypeId: contactTypeId || null,
        })
      );
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      setSummary(data as RunSummary);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(0);
    setFile(null);
    setPreview(null);
    setMapping({});
    setSummary(null);
    setError(null);
    setContactTypeId("");
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {step === 0 ? (
        <UploadStep
          file={file}
          dragging={dragging}
          setDragging={setDragging}
          onPick={pickFile}
          fileInputRef={fileInputRef}
          busy={busy}
          onNext={runPreview}
        />
      ) : null}

      {step === 1 && preview ? (
        <PreviewStep
          preview={preview}
          busy={busy}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      ) : null}

      {step === 2 && preview ? (
        <MappingStep
          preview={preview}
          mapping={mapping}
          setMapping={setMapping}
          contactTypes={contactTypes}
          contactTypeId={contactTypeId}
          setContactTypeId={setContactTypeId}
          busy={busy}
          onBack={() => setStep(1)}
          onRun={runImport}
        />
      ) : null}

      {step === 3 && summary ? (
        <SummaryStep summary={summary} onReset={reset} />
      ) : null}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                state === "done" && "bg-accent-50 text-accent-700",
                state === "active" && "bg-brand-600 text-white",
                state === "todo" && "bg-gray-100 text-gray-400"
              )}
            >
              {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "font-medium",
                state === "active" ? "text-gray-900" : "text-gray-500"
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 ? (
              <ArrowRight className="h-4 w-4 text-gray-300" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function UploadStep({
  file,
  dragging,
  setDragging,
  onPick,
  fileInputRef,
  busy,
  onNext,
}: {
  file: File | null;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onPick: (f: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  busy: boolean;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a lead list</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) onPick(dropped);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
            dragging
              ? "border-brand-500 bg-brand-50"
              : "border-gray-300 bg-gray-50/60 hover:border-brand-400 hover:bg-gray-50"
          )}
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Upload className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-gray-900">
            Drag &amp; drop a CSV or XLSX here
          </p>
          <p className="mt-1 text-sm text-gray-500">or click to browse</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </div>

        {file ? (
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
            <FileSpreadsheet className="h-5 w-5 text-brand-600" />
            <span className="font-medium text-gray-900">{file.name}</span>
            <span className="text-gray-500">
              {(file.size / 1024).toFixed(1)} KB
            </span>
          </div>
        ) : null}

        <p className="text-xs text-gray-500">
          Messy scraper exports are welcome. We parse nested JSON in{" "}
          <code className="rounded bg-gray-100 px-1">data</code>,{" "}
          <code className="rounded bg-gray-100 px-1">metadata</code> and{" "}
          <code className="rounded bg-gray-100 px-1">error</code> columns, and we
          automatically redact any API keys, tokens or passwords so they are
          never stored.
        </p>

        <div className="flex justify-end">
          <Button onClick={onNext} disabled={!file || busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewStep({
  preview,
  busy,
  onBack,
  onNext,
}: {
  preview: PreviewResponse;
  busy: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      {preview.redactedSecretCount > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {preview.redactedSecretCount} secret
              {preview.redactedSecretCount === 1 ? "" : "s"} detected and
              redacted
            </p>
            <p className="mt-0.5 text-sm text-red-700">
              API keys, tokens or passwords were found in this file. They have
              been replaced with <code>[REDACTED]</code> and will never be
              stored in your CRM.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">
          <CheckCircle2 className="h-5 w-5" />
          No secrets detected in this file.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Rows in file" value={preview.rowCount} />
        <Stat label="Businesses found" value={preview.businessCount} />
        <Stat label="Rows with nested JSON" value={preview.rowsWithNestedJson} />
        <Stat label="Secrets redacted" value={preview.redactedSecretCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detected columns</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              File headers
            </p>
            <div className="flex flex-wrap gap-2">
              {preview.headers.map((h) => (
                <Badge key={h} tone="neutral">
                  {h}
                </Badge>
              ))}
            </div>
          </div>
          {preview.discoveredFields.length ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <Braces className="h-3.5 w-3.5" /> Fields surfaced from nested
                JSON
              </p>
              <div className="flex flex-wrap gap-2">
                {preview.discoveredFields.map((f) => (
                  <Badge key={f} tone="brand">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {preview.sample.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Sample of discovered businesses</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Website</TH>
                  <TH>Email</TH>
                  <TH>City</TH>
                </TR>
              </THead>
              <TBody>
                {preview.sample.map((s, i) => (
                  <TR key={i}>
                    <TD className="font-medium text-gray-900">{s.name ?? "—"}</TD>
                    <TD>{s.website ?? "—"}</TD>
                    <TD>{s.email ?? "—"}</TD>
                    <TD>{s.city ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={busy}>
          Map columns <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MappingStep({
  preview,
  mapping,
  setMapping,
  contactTypes,
  contactTypeId,
  setContactTypeId,
  busy,
  onBack,
  onRun,
}: {
  preview: PreviewResponse;
  mapping: Partial<Record<MappableField, string | null>>;
  setMapping: React.Dispatch<
    React.SetStateAction<Partial<Record<MappableField, string | null>>>
  >;
  contactTypes: ContactType[];
  contactTypeId: string;
  setContactTypeId: (v: string) => void;
  busy: boolean;
  onBack: () => void;
  onRun: () => void;
}) {
  const hasName = Boolean(mapping.orgName);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Map columns to CRM fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            We auto-guessed the mapping from the column names. Adjust anything
            that looks off. Organization name is required.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {MAPPABLE_FIELDS.map((field) => (
              <label key={field} className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  {FIELD_LABELS[field]}
                  {field === "orgName" ? (
                    <span className="text-red-500"> *</span>
                  ) : null}
                </span>
                <Select
                  value={mapping[field] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      [field]: e.target.value || null,
                    }))
                  }
                >
                  <option value="">— not mapped —</option>
                  {preview.mappingColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tag these organizations as</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-500">
            Choose the type of people/organizations you are importing. These
            types are editable in Settings — add NGOs, funders, partners or any
            new type you like.
          </p>
          <Select
            value={contactTypeId}
            onChange={(e) => setContactTypeId(e.target.value)}
            className="max-w-sm"
          >
            <option value="">— no type —</option>
            {contactTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={onRun} disabled={busy || !hasName}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Run import
        </Button>
      </div>
      {!hasName ? (
        <p className="text-right text-xs text-red-500">
          Map a source column to Organization name to continue.
        </p>
      ) : null}
    </div>
  );
}

function SummaryStep({
  summary,
  onReset,
}: {
  summary: RunSummary;
  onReset: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-4 text-accent-700">
        <CheckCircle2 className="h-6 w-6" />
        <div>
          <p className="text-sm font-semibold text-accent-800">
            Import complete
          </p>
          <p className="text-sm">
            {summary.filename} imported successfully.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Rows processed" value={summary.rowCount} />
        <Stat label="Organizations" value={summary.orgCount} />
        <Stat label="Contacts" value={summary.contactCount} />
        <Stat label="Secrets redacted" value={summary.redactedSecretCount} />
      </div>

      {summary.redactedSecretCount > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <ShieldAlert className="h-4 w-4" />
          {summary.redactedSecretCount} secret
          {summary.redactedSecretCount === 1 ? "" : "s"} were redacted and never
          stored.
        </div>
      ) : null}

      {summary.sample.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Imported organizations (sample)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Domain</TH>
                  <TH>Primary email</TH>
                  <TH>City</TH>
                </TR>
              </THead>
              <TBody>
                {summary.sample.map((s, i) => (
                  <TR key={i}>
                    <TD className="font-medium text-gray-900">{s.name}</TD>
                    <TD>{s.domain ?? "—"}</TD>
                    <TD>{s.email ?? "—"}</TD>
                    <TD>{s.city ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onReset}>
          Import another file
        </Button>
        <Link href="/contacts">
          <Button>View contacts</Button>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}
