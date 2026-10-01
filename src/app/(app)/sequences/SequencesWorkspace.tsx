"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FileText,
  Sparkles,
  ListOrdered,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";

export interface TemplateDTO {
  id: string;
  name: string;
  subject: string;
  body: string;
}
export interface SnippetDTO {
  id: string;
  label: string;
  category: string | null;
  body: string;
}
export interface SequenceStepDTO {
  id: string;
  order: number;
  dayOffset: number;
  stopOnReply: boolean;
  templateId: string | null;
  templateName: string | null;
}
export interface SequenceDTO {
  id: string;
  name: string;
  isActive: boolean;
  enrollments: number;
  steps: SequenceStepDTO[];
}

type Tab = "templates" | "snippets" | "sequences";

export function SequencesWorkspace({
  templates,
  snippets,
  sequences,
}: {
  templates: TemplateDTO[];
  snippets: SnippetDTO[];
  sequences: SequenceDTO[];
}) {
  const [tab, setTab] = React.useState<Tab>("sequences");

  const tabs: { key: Tab; label: string; short: string; icon: React.ReactNode }[] = [
    { key: "sequences", label: "Sequences", short: "Sequences", icon: <ListOrdered className="h-4 w-4 shrink-0" aria-hidden /> },
    { key: "templates", label: "Templates", short: "Templates", icon: <FileText className="h-4 w-4 shrink-0" aria-hidden /> },
    { key: "snippets", label: "Proof-point snippets", short: "Snippets", icon: <Sparkles className="h-4 w-4 shrink-0" aria-hidden /> },
  ];

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Sequences and templates" className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex min-h-[40px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium transition-colors sm:gap-2 sm:px-3 ${
              tab === t.key
                ? "bg-brand-50 text-brand-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t.icon}
            <span className="truncate sm:hidden">{t.short}</span>
            <span className="hidden truncate sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "templates" ? <TemplatesTab templates={templates} /> : null}
      {tab === "snippets" ? <SnippetsTab snippets={snippets} /> : null}
      {tab === "sequences" ? (
        <SequencesTab sequences={sequences} templates={templates} />
      ) : null}
    </div>
  );
}

/* --------------------------------- Templates -------------------------------- */

function TemplatesTab({ templates }: { templates: TemplateDTO[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<TemplateDTO | null>(null);
  const [open, setOpen] = React.useState(false);

  function startNew() {
    setEditing({ id: "", name: "", subject: "", body: "" });
    setOpen(true);
  }
  function startEdit(t: TemplateDTO) {
    setEditing(t);
    setOpen(true);
  }
  async function save() {
    if (!editing) return;
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id || undefined,
        name: editing.name,
        subject: editing.subject,
        body: editing.body,
      }),
    });
    setOpen(false);
    router.refresh();
  }
  async function remove(id: string) {
    await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          Use <code className="rounded bg-gray-100 px-1">{"{{firstName}}"}</code>,{" "}
          <code className="rounded bg-gray-100 px-1">{"{{orgName}}"}</code>,{" "}
          <code className="rounded bg-gray-100 px-1">{"{{city}}"}</code>,{" "}
          <code className="rounded bg-gray-100 px-1">{"{{contactType}}"}</code> and{" "}
          <code className="rounded bg-gray-100 px-1">{"{{snippet:Label}}"}</code>.
        </p>
        <Button size="sm" onClick={startNew} className="shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4" aria-hidden /> New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="No templates yet"
              description="Create a reusable email with merge variables and snippet insertion."
              action={<Button onClick={startNew}>New template</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="break-words">{t.name}</CardTitle>
                    <CardDescription className="break-words">{t.subject}</CardDescription>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" className="h-10 w-10 px-0" onClick={() => startEdit(t)} aria-label={`Edit template ${t.name}`}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-10 w-10 px-0" onClick={() => remove(t.id)} aria-label={`Delete template ${t.name}`}>
                      <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-600">
                  {t.body}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing?.id ? "Edit template" : "New template"}
        className="max-w-2xl"
      >
        {editing ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="PSLE English — First Touch"
            />
            <label className="block text-sm font-medium text-gray-700">Subject</label>
            <Input
              value={editing.subject}
              onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              placeholder="Helping {{orgName}} lift PSLE English results"
            />
            <label className="block text-sm font-medium text-gray-700">Body</label>
            <Textarea
              className="min-h-[200px]"
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!editing.name || !editing.subject}>
                Save template
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

/* --------------------------------- Snippets --------------------------------- */

function SnippetsTab({ snippets }: { snippets: SnippetDTO[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<SnippetDTO | null>(null);
  const [open, setOpen] = React.useState(false);

  function startNew() {
    setEditing({ id: "", label: "", category: "", body: "" });
    setOpen(true);
  }
  async function save() {
    if (!editing) return;
    await fetch("/api/snippets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id || undefined,
        label: editing.label,
        category: editing.category,
        body: editing.body,
      }),
    });
    setOpen(false);
    router.refresh();
  }
  async function remove(id: string) {
    await fetch(`/api/snippets?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          Reusable proof points and value props. Insert with{" "}
          <code className="rounded bg-gray-100 px-1">{"{{snippet:Label}}"}</code>.
        </p>
        <Button size="sm" onClick={startNew} className="shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4" aria-hidden /> New snippet
        </Button>
      </div>

      {snippets.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="No snippets yet"
              description="Save your strongest proof points once and reuse them everywhere."
              action={<Button onClick={startNew}>New snippet</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {snippets.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="break-words">{s.label}</CardTitle>
                    {s.category ? (
                      <Badge tone="brand" className="mt-1">
                        {s.category}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 px-0"
                      aria-label={`Edit snippet ${s.label}`}
                      onClick={() => {
                        setEditing(s);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-10 w-10 px-0" onClick={() => remove(s.id)} aria-label={`Delete snippet ${s.label}`}>
                      <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap break-words text-sm text-gray-600">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing?.id ? "Edit snippet" : "New snippet"}
      >
        {editing ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Label</label>
            <Input
              value={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              placeholder="PSLE Proof"
            />
            <label className="block text-sm font-medium text-gray-700">
              Category (optional)
            </label>
            <Input
              value={editing.category ?? ""}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              placeholder="Proof point"
            />
            <label className="block text-sm font-medium text-gray-700">Body</label>
            <Textarea
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!editing.label || !editing.body}>
                Save snippet
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

/* -------------------------------- Sequences --------------------------------- */

interface StepDraft {
  dayOffset: number;
  templateId: string | null;
  stopOnReply: boolean;
}

function SequencesTab({
  sequences,
  templates,
}: {
  sequences: SequenceDTO[];
  templates: TemplateDTO[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [steps, setSteps] = React.useState<StepDraft[]>([
    { dayOffset: 0, templateId: templates[0]?.id ?? null, stopOnReply: true },
  ]);

  function reset() {
    setName("");
    setSteps([{ dayOffset: 0, templateId: templates[0]?.id ?? null, stopOnReply: true }]);
  }
  async function save() {
    await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, steps }),
    });
    setOpen(false);
    reset();
    router.refresh();
  }
  async function remove(id: string) {
    await fetch(`/api/sequences?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          Cadences auto-stop when a contact replies, bounces, or opts out.
          Day offsets are counted in Singapore business days. Steps after the
          first go out as replies in the same thread (&quot;Re: &lt;first
          subject&gt;&quot;), so only the first step&apos;s subject is used.
        </p>
        <Button
          size="sm"
          className="shrink-0 self-start sm:self-auto"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden /> New sequence
        </Button>
      </div>

      {sequences.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<ListOrdered className="h-5 w-5" />}
              title="No sequences yet"
              description="Chain templates with business-day offsets and stop-on-reply rules."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sequences.map((seq) => (
            <Card key={seq.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="break-words">{seq.name}</CardTitle>
                    <CardDescription>
                      {seq.steps.length} step{seq.steps.length === 1 ? "" : "s"} ·{" "}
                      {seq.enrollments} enrolled
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={seq.isActive ? "success" : "neutral"}>
                      {seq.isActive ? "Active" : "Paused"}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-10 w-10 px-0" onClick={() => remove(seq.id)} aria-label={`Delete sequence ${seq.name}`}>
                      <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {seq.steps.map((st) => (
                    <li
                      key={st.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                        {st.order + 1}
                      </span>
                      <span className="font-medium text-gray-800">
                        {st.templateName ?? "(no template)"}
                      </span>
                      <Badge tone="neutral">
                        {st.dayOffset === 0
                          ? "Send immediately"
                          : `+${st.dayOffset} business day${st.dayOffset === 1 ? "" : "s"}`}
                      </Badge>
                      {st.stopOnReply ? (
                        <Badge tone="brand">Stop on reply</Badge>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New sequence"
        description="Enroll contacts from the Leads table once it's saved."
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PSLE English Outreach"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Steps</label>
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <Select
                  aria-label={`Template for step ${i + 1}`}
                  className="min-w-[10rem] flex-1"
                  value={step.templateId ?? ""}
                  onChange={(e) => {
                    const next = [...steps];
                    next[i] = { ...step, templateId: e.target.value || null };
                    setSteps(next);
                  }}
                >
                  <option value="">(no template)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <div className="ml-auto flex items-center gap-1">
                  <span className="text-xs text-gray-500">+</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="w-16"
                    aria-label={`Business days for step ${i + 1}`}
                    value={step.dayOffset}
                    onChange={(e) => {
                      const next = [...steps];
                      next[i] = { ...step, dayOffset: Number(e.target.value) || 0 };
                      setSteps(next);
                    }}
                  />
                  <span className="text-xs text-gray-500">bd</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 px-0"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                  disabled={steps.length === 1}
                >
                  <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setSteps([
                  ...steps,
                  { dayOffset: 2, templateId: templates[0]?.id ?? null, stopOnReply: true },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Add step
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!name}>
              Create sequence
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
