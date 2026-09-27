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
import { Stepper } from "@/components/ui/Stepper";
import { ProgressBar } from "@/components/ui/ProgressBar";
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
  nextOffset: number | null;
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
const MULTI_STEPS = ["Upload", "Check files", "Done"] as const;

type Mapping = Partial<Record<MappableField, string | null>>;

interface MultiFile {
  file: File;
  status: "checking" | "ready" | "importing" | "done" | "skipped" | "error";
  preview?: PreviewResponse;
  result?: RunSummary;
  progress?: { done: number; total: number };
  error?: string;
}

/** Ask the server to parse a file and guess its column mapping (nothing is saved). */
async function previewFile(file: File): Promise<PreviewResponse> {
  const form = new FormData();
  form.set("file", file);
  form.set("mode", "preview");
  const res = await fetch("/api/import", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Preview failed.");
  return data as PreviewResponse;
}

/**
 * Import one file in small chunks so each request stays well inside the
 * serverless time limit, even for large lead lists.
 */
async function importFile(
  file: File,
  mapping: Mapping,
  contactTypeId: string,
  onProgress: (done: number, total: number) => void
): Promise<RunSummary> {
  let offset: number | null = 0;
  let batchId = "";
  let last: RunSummary | null = null;
  while (offset !== null) {
    const form = new FormData();
    form.set("file", file);
    form.set("mode", "run");
    form.set("offset", String(offset));
    form.set("limit", "40");
    if (batchId) form.set("batchId", batchId);
    form.set("config", JSON.stringify({ mapping, contactTypeId: contactTypeId || null }));
    const res = await fetch("/api/import", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Import failed.");
    last = data as RunSummary;
    batchId = last.batchId;
    offset = last.nextOffset;
    onProgress(offset ?? last.orgCount, last.orgCount);
  }
  if (!last) throw new Error("Import failed.");
  return last;
}

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
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fetch("/api/contact-types")
      .then((r) => r.json())
      .then((d) => setContactTypes(d.contactTypes ?? []))
      .catch(() => setContactTypes([]));
  }, []);

  // Several files: each is auto-mapped and imported in turn.
  const [files, setFiles] = React.useState<File[]>([]);
  const [multi, setMulti] = React.useState<MultiFile[] | null>(null);

  function pickFiles(list: File[]) {
    setError(null);
    // Merge with what's already picked; skip exact duplicates (same name + size).
    const merged = [...files];
    for (const f of list) {
      if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
    }
    setFiles(merged);
    setFile(merged.length === 1 ? merged[0] : null);
  }

  function removeFile(i: number) {
    const next = files.filter((_, idx) => idx !== i);
    setFiles(next);
    setFile(next.length === 1 ? next[0] : null);
  }

  async function runPreview() {
    if (files.length > 1) return runMultiPreview();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const data = await previewFile(file);
      setPreview(data);
      setMapping(data.autoMapping ?? {});
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runMultiPreview() {
    setBusy(true);
    setError(null);
    const out: MultiFile[] = files.map((f) => ({ file: f, status: "checking" }));
    setMulti([...out]);
    setStep(1);
    for (let i = 0; i < out.length; i++) {
      try {
        out[i] = { ...out[i], status: "ready", preview: await previewFile(out[i].file) };
      } catch (e) {
        out[i] = { ...out[i], status: "error", error: e instanceof Error ? e.message : "Could not read file." };
      }
      setMulti([...out]);
    }
    setBusy(false);
  }

  async function runImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const last = await importFile(file, mapping, contactTypeId, (done, total) => setProgress({ done, total }));
      setSummary(last);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runMultiImport() {
    if (!multi) return;
    setBusy(true);
    setError(null);
    const out = [...multi];
    for (let i = 0; i < out.length; i++) {
      const item = out[i];
      if (item.status !== "ready" || !item.preview?.autoMapping.orgName) {
        if (item.status === "ready") out[i] = { ...item, status: "skipped", error: "No organization name column found." };
        setMulti([...out]);
        continue;
      }
      out[i] = { ...item, status: "importing" };
      setMulti([...out]);
      try {
        const result = await importFile(item.file, item.preview.autoMapping, contactTypeId, (done, total) => {
          out[i] = { ...out[i], progress: { done, total } };
          setMulti([...out]);
        });
        out[i] = { ...out[i], status: "done", result };
      } catch (e) {
        out[i] = { ...out[i], status: "error", error: e instanceof Error ? e.message : "Import failed." };
      }
      setMulti([...out]);
    }
    setBusy(false);
    setStep(2);
  }

  function reset() {
    setStep(0);
    setFile(null);
    setFiles([]);
    setMulti(null);
    setPreview(null);
    setMapping({});
    setSummary(null);
    setError(null);
    setContactTypeId("");
  }

  return (
    <div className="space-y-6">
      <Stepper steps={multi ? MULTI_STEPS : STEPS} current={step} />

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {busy && progress ? (
        <ProgressBar value={progress.done} max={progress.total} label="Importing organizations" />
      ) : null}

      {step === 0 ? (
        <UploadStep
          files={files}
          dragging={dragging}
          setDragging={setDragging}
          onPick={pickFiles}
          onRemove={removeFile}
          fileInputRef={fileInputRef}
          busy={busy}
          onNext={runPreview}
        />
      ) : null}

      {multi && step >= 1 ? (
        <MultiFileStep
          items={multi}
          step={step}
          busy={busy}
          contactTypes={contactTypes}
          contactTypeId={contactTypeId}
          setContactTypeId={setContactTypeId}
          onBack={() => {
            setMulti(null);
            setStep(0);
          }}
          onRun={runMultiImport}
          onReset={reset}
        />
      ) : null}

      {!multi && step === 1 && preview ? (
        <PreviewStep
          preview={preview}
          busy={busy}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      ) : null}

      {!multi && step === 2 && preview ? (
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

      {!multi && step === 3 && summary ? (
        <SummaryStep summary={summary} onReset={reset} />
      ) : null}
    </div>
  );
}

function UploadStep({
  files,
  dragging,
  setDragging,
  onPick,
  onRemove,
  fileInputRef,
  busy,
  onNext,
}: {
  files: File[];
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onPick: (f: File[]) => void;
  onRemove: (index: number) => void;
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
            const dropped = Array.from(e.dataTransfer.files ?? []);
            if (dropped.length) onPick(dropped);
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
            Drag &amp; drop one or more CSV / XLSX files here
          </p>
          <p className="mt-1 text-sm text-gray-600">or click to browse (you can select several at once)</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
            className="hidden"
            onChange={(e) => {
              onPick(Array.from(e.target.files ?? []));
              // Allow picking the same file again after removing it.
              e.target.value = "";
            }}
          />
        </div>

        {files.length ? (
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${f.size}`}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm"
              >
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-brand-900" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{f.name}</span>
                <span className="shrink-0 text-gray-600">{(f.size / 1024).toFixed(1)} KB</span>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-red-700"
                  aria-label={`Remove ${f.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {files.length > 1 ? (
          <p className="text-xs text-gray-600">
            With several files, columns are matched automatically for each file and you&apos;ll see a check of every
            file before anything is imported. Duplicate organizations across files are merged.
          </p>
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
          <Button onClick={onNext} disabled={files.length === 0 || busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden />
            )}
            {files.length > 1 ? `Check ${files.length} files` : "Preview"}
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
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
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
  const hasEmail = Boolean(mapping.contactEmail);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Map columns to CRM fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            We auto-guessed the mapping from the column names. Adjust anything
            that looks off. Organization name is required.
          </p>
          {!hasEmail ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No email column detected. Pick one for &quot;Contact email&quot; if your file has emails, otherwise
              these leads can&apos;t be emailed.
            </p>
          ) : null}
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
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-800">
        <CheckCircle2 className="h-6 w-6" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">
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
        <Stat label="Email addresses" value={summary.contactCount} />
        <Stat label="Secrets redacted" value={summary.redactedSecretCount} />
      </div>

      {summary.contactCount === 0 ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">No email addresses found in this file.</span> The organizations were added
            to Leads (with phone and website), but they can&apos;t be verified or emailed until you import a list with an
            email column. Check the &quot;Contact email&quot; mapping in the previous step.
          </p>
        </div>
      ) : null}

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
        <Link href="/verification">
          <Button>Next: verify emails</Button>
        </Link>
      </div>
    </div>
  );
}

const MULTI_STATUS: Record<MultiFile["status"], { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" }> = {
  checking: { label: "Checking…", tone: "neutral" },
  ready: { label: "Ready", tone: "brand" },
  importing: { label: "Importing…", tone: "warning" },
  done: { label: "Imported", tone: "success" },
  skipped: { label: "Skipped", tone: "warning" },
  error: { label: "Error", tone: "danger" },
};

function MultiFileStep({
  items,
  step,
  busy,
  contactTypes,
  contactTypeId,
  setContactTypeId,
  onBack,
  onRun,
  onReset,
}: {
  items: MultiFile[];
  step: number;
  busy: boolean;
  contactTypes: ContactType[];
  contactTypeId: string;
  setContactTypeId: (v: string) => void;
  onBack: () => void;
  onRun: () => void;
  onReset: () => void;
}) {
  const finished = step >= 2;
  const ready = items.filter((i) => i.status === "ready" && i.preview?.autoMapping.orgName).length;
  const checking = items.some((i) => i.status === "checking");
  const totals = items.reduce(
    (t, i) => ({
      orgs: t.orgs + (i.result?.orgCount ?? 0),
      emails: t.emails + (i.result?.contactCount ?? 0),
      secrets: t.secrets + (i.result?.redactedSecretCount ?? i.preview?.redactedSecretCount ?? 0),
    }),
    { orgs: 0, emails: 0, secrets: 0 }
  );

  return (
    <div className="space-y-6">
      {finished ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-800">
          <CheckCircle2 className="h-6 w-6" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              Imported {items.filter((i) => i.status === "done").length} of {items.length} files
            </p>
            <p className="text-sm">
              {totals.orgs} organizations and {totals.emails} email addresses added. Duplicates across files were merged.
            </p>
          </div>
        </div>
      ) : null}

      {totals.secrets > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
          {totals.secrets} API key{totals.secrets === 1 ? "" : "s"} / token{totals.secrets === 1 ? "" : "s"} found in these
          files were redacted and will never be stored.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{finished ? "Results per file" : "Check your files"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>File</TH>
                <TH>Businesses</TH>
                <TH>Email column</TH>
                <TH>{finished ? "Added" : "Status"}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => {
                const s = MULTI_STATUS[item.status];
                const emailCol = item.preview?.autoMapping.contactEmail ?? null;
                return (
                  <TR key={`${item.file.name}-${item.file.size}`}>
                    <TD className="max-w-[240px]">
                      <p className="truncate font-medium text-gray-900">{item.file.name}</p>
                      {item.error ? <p className="text-xs text-red-800">{item.error}</p> : null}
                    </TD>
                    <TD>{item.preview ? item.preview.businessCount : "—"}</TD>
                    <TD>
                      {!item.preview ? (
                        "—"
                      ) : emailCol ? (
                        <Badge tone="success">{emailCol}</Badge>
                      ) : (
                        <Badge tone="warning">none found</Badge>
                      )}
                    </TD>
                    <TD>
                      {item.status === "done" && item.result ? (
                        <span className="text-sm text-gray-800">
                          {item.result.orgCount} orgs · {item.result.contactCount} emails
                        </span>
                      ) : item.status === "importing" && item.progress ? (
                        <ProgressBar value={item.progress.done} max={item.progress.total} label="Importing" className="w-40" />
                      ) : (
                        <Badge tone={s.tone}>{s.label}</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {!finished && items.some((i) => i.preview && !i.preview.autoMapping.contactEmail) ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Files marked &quot;none found&quot; have no email column. Their organizations are still added to Leads (with
          phone and website) but can&apos;t be emailed. To choose columns by hand, import that file on its own.
        </p>
      ) : null}

      {!finished ? (
        <Card>
          <CardHeader>
            <CardTitle>Tag all of these organizations as</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              aria-label="Contact type"
              value={contactTypeId}
              onChange={(e) => setContactTypeId(e.target.value)}
              className="max-w-sm"
              disabled={busy}
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
      ) : null}

      <div className="flex justify-between">
        {finished ? (
          <>
            <Button variant="secondary" onClick={onReset}>
              Import more files
            </Button>
            <Link href="/verification">
              <Button>Next: verify emails</Button>
            </Link>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onBack} disabled={busy}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </Button>
            <Button onClick={onRun} disabled={busy || checking || ready === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              Import {ready} file{ready === 1 ? "" : "s"}
            </Button>
          </>
        )}
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
