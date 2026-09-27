"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  ListOrdered,
  Loader2,
  Mail,
  PenSquare,
  RotateCcw,
  Send,
  SkipForward,
  Sparkles,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stepper } from "@/components/ui/Stepper";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { renderEmail, buildMergeContext, type MergeSnippet } from "@/lib/merge";
import { findPlaceholders } from "@/lib/placeholders";

/* ---------------------------------- types --------------------------------- */

interface QueueItem {
  id: string;
  status: string;
  subject: string;
  body: string;
  error: string | null;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  orgName: string | null;
  sequenceName: string | null;
  scheduledFor: string | null;
}

/** "Thu, 8 Jan, 09:00" in Singapore time. */
function fmtSchedule(iso: string): string {
  return new Date(iso).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
interface ContactDTO {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  title: string | null;
  email: string | null;
  orgName: string | null;
  city: string | null;
  country: string | null;
  contactTypeId: string | null;
  contactType: string | null;
  stageId: string | null;
  verification: string | null;
  isRoleInbox: boolean;
  sentCount: number;
}
interface TemplateDTO {
  id: string;
  name: string;
  subject: string;
  body: string;
}
interface SnippetDTO {
  id: string;
  label: string;
  body: string;
}
interface SequenceDTO {
  id: string;
  name: string;
  steps: { order: number; dayOffset: number; templateName: string; subject: string; body: string }[];
}
interface Option {
  id: string;
  name: string;
}

type Tab = "ready" | "new";

const SEND_GAP_MS = 3000; // pause between sends in "Send all" (gentle on Gmail)

function contactName(c: ContactDTO): string {
  return c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown";
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* -------------------------------- workspace ------------------------------- */

export function SendWorkspace(props: {
  initialTab: Tab;
  preselectContactId: string | null;
  mailConfigured: boolean;
  sentToday: number;
  dailyLimit: number;
  queue: QueueItem[];
  contacts: ContactDTO[];
  templates: TemplateDTO[];
  snippets: SnippetDTO[];
  sequences: SequenceDTO[];
  contactTypes: Option[];
  stages: Option[];
}) {
  const [tab, setTab] = React.useState<Tab>(props.preselectContactId ? "new" : props.initialTab);
  const [flash, setFlash] = React.useState<string | null>(null);

  return (
    <div className="space-y-6">
      {flash ? (
        <div role="status" className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <span>{flash}</span>
          <button type="button" className="text-xs font-semibold underline" onClick={() => setFlash(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {!props.mailConfigured ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Email isn&apos;t connected yet.</span> You can prepare emails, but sending
            needs Gmail credentials. See{" "}
            <Link href="/settings" className="font-semibold underline">
              Settings
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div role="tablist" aria-label="Write and send" className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-card">
        <TabButton active={tab === "ready"} onClick={() => setTab("ready")} icon={<Inbox className="h-4 w-4" aria-hidden />}>
          Ready to send
          <span
            className={cn(
              "ml-1 rounded-full px-2 text-xs font-bold",
              tab === "ready" ? "bg-accent-400 text-brand-950" : "bg-gray-100 text-gray-700"
            )}
          >
            {props.queue.length}
          </span>
        </TabButton>
        <TabButton active={tab === "new"} onClick={() => setTab("new")} icon={<PenSquare className="h-4 w-4" aria-hidden />}>
          New email
        </TabButton>
      </div>

      {tab === "ready" ? (
        <ReadyToSend
          queue={props.queue}
          sentToday={props.sentToday}
          dailyLimit={props.dailyLimit}
          mailConfigured={props.mailConfigured}
          onNew={() => setTab("new")}
        />
      ) : (
        <NewEmailWizard
          {...props}
          onDone={(message) => {
            setFlash(message);
            setTab("ready");
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
        active ? "bg-brand-900 text-white" : "text-gray-700 hover:bg-gray-100"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ------------------------------ ready to send ----------------------------- */

function ReadyToSend({
  queue,
  sentToday: initialSent,
  dailyLimit,
  mailConfigured,
  onNew,
}: {
  queue: QueueItem[];
  sentToday: number;
  dailyLimit: number;
  mailConfigured: boolean;
  onNew: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(queue);
  const [sentToday, setSentToday] = React.useState(initialSent);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [run, setRun] = React.useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = React.useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const stopRef = React.useRef(false);

  React.useEffect(() => setItems(queue), [queue]);

  // "Send all" only sends emails with no future schedule (scheduled ones go out
  // on their own; use "Send now" on the card to send one early).
  const sendable = items.filter(
    (m) =>
      m.status !== "sending" &&
      findPlaceholders(m.subject, m.body).length === 0 &&
      (!m.scheduledFor || new Date(m.scheduledFor).getTime() <= Date.now())
  );
  const remaining = Math.max(0, dailyLimit - sentToday);

  async function sendOne(m: QueueItem): Promise<"ok" | "limit" | "fail"> {
    setBusyId(m.id);
    const { ok, status, data } = await postJson("/api/messages/action", { messageId: m.id, action: "send" });
    setBusyId(null);
    if (ok) {
      setItems((list) => list.filter((x) => x.id !== m.id));
      if (typeof data.sentToday === "number") setSentToday(data.sentToday);
      else setSentToday((n) => n + 1);
      return "ok";
    }
    if (status === 429) {
      setNotice({ tone: "warn", text: data.reason ?? "Daily limit reached." });
      return "limit";
    }
    setItems((list) =>
      list.map((x) => (x.id === m.id ? { ...x, status: data.code === "send_failed" ? "failed" : x.status, error: data.reason ?? "Send failed" } : x))
    );
    setNotice({ tone: "error", text: `${m.contactName}: ${data.reason ?? data.error ?? "Send failed."}` });
    return "fail";
  }

  async function sendAll() {
    const batch = sendable.slice(0, remaining);
    if (!batch.length) return;
    stopRef.current = false;
    setNotice(null);
    setRun({ done: 0, total: batch.length });
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < batch.length; i++) {
      if (stopRef.current) break;
      const r = await sendOne(batch[i]);
      if (r === "limit") break;
      if (r === "ok") sent += 1;
      else failed += 1;
      setRun({ done: i + 1, total: batch.length });
      if (i < batch.length - 1 && !stopRef.current) await new Promise((res) => setTimeout(res, SEND_GAP_MS));
    }
    setRun(null);
    setNotice((n) =>
      n?.tone === "warn"
        ? n
        : { tone: failed ? "error" : "ok", text: `Sent ${sent} email${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed (see below)` : ""}.` }
    );
    router.refresh();
  }

  async function skip(m: QueueItem) {
    setBusyId(m.id);
    const { ok } = await postJson("/api/messages/action", { messageId: m.id, action: "skip" });
    setBusyId(null);
    if (ok) setItems((list) => list.filter((x) => x.id !== m.id));
    router.refresh();
  }

  async function saveEdit(m: QueueItem, subject: string, body: string) {
    const { ok, data } = await postJson("/api/messages", { id: m.id, contactId: m.contactId, subject, body, status: "queued" });
    if (ok) {
      setItems((list) => list.map((x) => (x.id === m.id ? { ...x, subject, body, status: "queued", error: null } : x)));
      setEditing(null);
    } else setNotice({ tone: "error", text: data.error ?? "Could not save." });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-5 w-5" aria-hidden />}
        title="Nothing waiting to send"
        description="Create personalized emails for a group of leads, or enroll them in a sequence. Follow-up steps also land here when they're due."
        action={
          <Button onClick={onNew}>
            <PenSquare className="h-4 w-4" aria-hidden /> Write a new email
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-700">
            <p className="font-semibold text-brand-950">
              {items.length} email{items.length === 1 ? "" : "s"} ready · {sentToday}/{dailyLimit} sent today
            </p>
            <p className="text-gray-600">
              Send all sends the un-scheduled ones now, one at a time. Scheduled emails go out on their own
              (use &quot;Send now&quot; on a card to send it early).
              {sendable.length > remaining ? ` Only ${remaining} more can go out today.` : ""}
            </p>
          </div>
          {run ? (
            <Button variant="secondary" onClick={() => (stopRef.current = true)}>
              <Square className="h-4 w-4" aria-hidden /> Stop
            </Button>
          ) : (
            <Button
              variant="accent"
              size="lg"
              onClick={sendAll}
              disabled={!mailConfigured || sendable.length === 0 || remaining === 0 || busyId !== null}
            >
              <Send className="h-4 w-4" aria-hidden /> Send all ({Math.min(sendable.length, remaining)})
            </Button>
          )}
        </CardContent>
        {run ? (
          <div className="px-5 pb-5">
            <ProgressBar value={run.done} max={run.total} label="Sending" tone="accent" />
          </div>
        ) : null}
      </Card>

      {notice ? (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            notice.tone === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-900",
            notice.tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
            notice.tone === "error" && "border-red-200 bg-red-50 text-red-900"
          )}
        >
          {notice.text}
        </div>
      ) : null}

      <ul className="space-y-3">
        {items.map((m) => {
          const missing = findPlaceholders(m.subject, m.body);
          const isEditing = editing === m.id;
          return (
            <li key={m.id}>
              <Card className={cn(m.status === "failed" && "border-red-200")}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/contacts/${m.contactId}`} className="font-semibold text-brand-950 hover:underline">
                        {m.contactName}
                      </Link>
                      <p className="truncate text-xs text-gray-600">
                        {m.contactEmail}
                        {m.orgName ? ` · ${m.orgName}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {m.sequenceName ? (
                        <Badge tone="brand">
                          <ListOrdered className="h-3 w-3" aria-hidden /> {m.sequenceName}
                        </Badge>
                      ) : null}
                      {missing.length ? <Badge tone="warning">Needs fixing</Badge> : null}
                      {m.scheduledFor ? (
                        <Badge tone="info">
                          <Clock className="h-3 w-3" aria-hidden /> {fmtSchedule(m.scheduledFor)}
                        </Badge>
                      ) : null}
                      <Badge tone={statusTone(m.status)}>{m.status === "queued" || m.status === "approved" ? "ready" : m.status}</Badge>
                    </div>
                  </div>

                  {m.error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{m.error}</p> : null}
                  {missing.length ? (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Fill in {missing.join(", ")} before sending — click Edit.
                    </p>
                  ) : null}

                  {isEditing ? (
                    <EditForm item={m} onCancel={() => setEditing(null)} onSave={(s, b) => saveEdit(m, s, b)} />
                  ) : (
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-sm font-semibold text-gray-900">{m.subject || "(no subject)"}</p>
                      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-gray-700">{m.body}</p>
                    </div>
                  )}

                  {!isEditing ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => sendOne(m).then(() => router.refresh())}
                        disabled={!mailConfigured || busyId !== null || !!run || missing.length > 0 || remaining === 0}
                      >
                        {busyId === m.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : m.status === "failed" ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                        {m.status === "failed" ? "Retry" : m.scheduledFor ? "Send now" : "Send"}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(m.id)} disabled={!!run}>
                        <PenSquare className="h-4 w-4" aria-hidden /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => skip(m)} disabled={busyId !== null || !!run}>
                        <SkipForward className="h-4 w-4" aria-hidden /> Skip
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EditForm({
  item,
  onCancel,
  onSave,
}: {
  item: QueueItem;
  onCancel: () => void;
  onSave: (subject: string, body: string) => void;
}) {
  const [subject, setSubject] = React.useState(item.subject);
  const [body, setBody] = React.useState(item.body);
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Subject</span>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Body</span>
        <Textarea className="min-h-[200px]" value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(subject, body)} disabled={!subject.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ new email wizard -------------------------- */

const WIZARD_STEPS = ["Pick leads", "Choose message", "Preview & add"] as const;

function NewEmailWizard({
  contacts,
  templates,
  snippets,
  sequences,
  contactTypes,
  stages,
  preselectContactId,
  onDone,
}: {
  contacts: ContactDTO[];
  templates: TemplateDTO[];
  snippets: SnippetDTO[];
  sequences: SequenceDTO[];
  contactTypes: Option[];
  stages: Option[];
  preselectContactId: string | null;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(preselectContactId && contacts.some((c) => c.id === preselectContactId) ? [preselectContactId] : [])
  );
  const [mode, setMode] = React.useState<"single" | "sequence">("single");
  const [templateId, setTemplateId] = React.useState(templates[0]?.id ?? "");
  const [subject, setSubject] = React.useState(templates[0]?.subject ?? "");
  const [body, setBody] = React.useState(templates[0]?.body ?? "");
  const [sequenceId, setSequenceId] = React.useState(sequences[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [schedule, setSchedule] = React.useState<"now" | "today" | "thursday">("thursday");
  const [todayTime, setTodayTime] = React.useState("09:00");

  const chosen = contacts.filter((c) => selected.has(c.id));
  const mergeSnippets: MergeSnippet[] = snippets.map((s) => ({ label: s.label, body: s.body }));
  const seq = sequences.find((s) => s.id === sequenceId) ?? null;
  const messageTemplate =
    mode === "single" ? { subject, body } : { subject: seq?.steps[0]?.subject ?? "", body: seq?.steps[0]?.body ?? "" };

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    setSubject(t?.subject ?? "");
    setBody(t?.body ?? "");
  }

  async function addToReady() {
    setBusy(true);
    setError(null);
    try {
      const ids = [...selected];
      let created = 0;
      let skipped = 0;
      if (mode === "single") {
        for (let i = 0; i < ids.length; i += 200) {
          const { ok, data } = await postJson("/api/messages/bulk", {
            contactIds: ids.slice(i, i + 200),
            templateId: templateId || undefined,
            subject,
            body,
            schedule,
            todayTime,
          });
          if (!ok) throw new Error(data.error ?? "Could not create emails.");
          created += data.created;
          skipped += data.skipped?.length ?? 0;
        }
      } else {
        if (!sequenceId) throw new Error("Pick a sequence.");
        for (let i = 0; i < ids.length; i += 100) {
          const { ok, data } = await postJson("/api/sequences/enroll", { sequenceId, contactIds: ids.slice(i, i + 100) });
          if (!ok) throw new Error(data.error ?? "Could not enroll.");
          created += data.queuedMessages;
          skipped += data.skipped;
        }
      }
      setSelected(new Set());
      setStep(0);
      router.refresh();
      const when =
        mode === "sequence" || schedule === "now"
          ? "They're in Ready to send."
          : schedule === "thursday"
          ? "They'll send next Thursday morning (Singapore time)."
          : `They'll send today at ${todayTime} (Singapore time).`;
      onDone(
        `Added ${created} email${created === 1 ? "" : "s"} to Ready to send. ${when}` +
          (skipped ? ` Skipped ${skipped} (suppressed, no email, demo address or already queued).` : "")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Stepper steps={WIZARD_STEPS} current={step} />
      {error ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      {step === 0 ? (
        <PickLeads
          contacts={contacts}
          contactTypes={contactTypes}
          stages={stages}
          selected={selected}
          setSelected={setSelected}
          onNext={() => setStep(1)}
        />
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>What should they get?</CardTitle>
            <CardDescription>
              {chosen.length} lead{chosen.length === 1 ? "" : "s"} selected. Use {"{{firstName|there}}"} style fields to
              personalize — the part after | is used when a lead has no value.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Email type">
              <ModeCard
                active={mode === "single"}
                onClick={() => setMode("single")}
                icon={<Mail className="h-5 w-5" aria-hidden />}
                title="One email"
                text="A single personalized email to each lead."
              />
              <ModeCard
                active={mode === "sequence"}
                onClick={() => setMode("sequence")}
                icon={<ListOrdered className="h-5 w-5" aria-hidden />}
                title="Sequence"
                text="First email now, follow-ups drafted automatically. Stops when they reply."
                disabled={sequences.length === 0}
              />
            </div>

            {mode === "single" ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Start from a template</span>
                  <Select value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
                    <option value="">Write from scratch</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Subject</span>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Body</span>
                  <Textarea className="min-h-[220px]" value={body} onChange={(e) => setBody(e.target.value)} />
                </label>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 font-medium text-gray-600">
                    <Sparkles className="h-3 w-3" aria-hidden /> Insert:
                  </span>
                  {["{{firstName|there}}", "{{orgName}}", "{{city}}"].map((tok) => (
                    <Chip key={tok} onClick={() => setBody((b) => b + tok)}>
                      {tok}
                    </Chip>
                  ))}
                  {snippets.map((s) => (
                    <Chip key={s.id} onClick={() => setBody((b) => `${b}{{snippet:${s.label}}}`)}>
                      + {s.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Sequence</span>
                  <Select value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
                    {sequences.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </label>
                {seq ? (
                  <ol className="space-y-2">
                    {seq.steps.map((st, i) => (
                      <li key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <span className="font-medium text-gray-900">{st.templateName}</span>
                        <span className="text-gray-600">
                          {i === 0 ? "right away" : `${st.dayOffset - (seq.steps[i - 1]?.dayOffset ?? 0)} business days after the previous one`}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <p className="text-xs text-gray-600">
                  Edit sequence steps under More → Sequences &amp; templates.
                </p>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(0)}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={mode === "single" ? !subject.trim() || !body.trim() : !seq}
              >
                Preview <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <PreviewStep
          contacts={chosen}
          template={messageTemplate}
          snippets={mergeSnippets}
          mode={mode}
          busy={busy}
          schedule={schedule}
          setSchedule={setSchedule}
          todayTime={todayTime}
          setTodayTime={setTodayTime}
          onBack={() => setStep(1)}
          onConfirm={addToReady}
        />
      ) : null}
    </div>
  );
}

function ScheduleOption({ active, onClick, title, text }: { active: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "rounded-xl border-2 p-3 text-left transition-colors",
        active ? "border-brand-900 bg-brand-50" : "border-gray-200 bg-white hover:border-gray-300"
      )}
    >
      <span className="block text-sm font-semibold text-brand-950">{title}</span>
      <span className="block text-xs text-gray-600">{text}</span>
    </button>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-gray-300 bg-white px-2.5 py-1 font-mono text-[11px] text-gray-800 hover:border-brand-400 hover:bg-brand-50"
    >
      {children}
    </button>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  text,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  text: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors disabled:opacity-50",
        active ? "border-brand-900 bg-brand-50" : "border-gray-200 bg-white hover:border-gray-300"
      )}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", active ? "bg-brand-900 text-white" : "bg-gray-100 text-gray-700")}>
        {icon}
      </span>
      <span>
        <span className="block font-semibold text-brand-950">{title}</span>
        <span className="block text-sm text-gray-600">{text}</span>
      </span>
    </button>
  );
}

function PickLeads({
  contacts,
  contactTypes,
  stages,
  selected,
  setSelected,
  onNext,
}: {
  contacts: ContactDTO[];
  contactTypes: Option[];
  stages: Option[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onNext: () => void;
}) {
  const [q, setQ] = React.useState("");
  const [typeId, setTypeId] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [checkedOnly, setCheckedOnly] = React.useState(true);
  const [notEmailed, setNotEmailed] = React.useState(true);

  const filtered = contacts.filter((c) => {
    if (checkedOnly && !(c.verification === "valid" || c.verification === "risky")) return false;
    if (notEmailed && c.sentCount > 0) return false;
    if (typeId && c.contactTypeId !== typeId) return false;
    if (stageId && c.stageId !== stageId) return false;
    if (q) {
      const hay = `${contactName(c)} ${c.email ?? ""} ${c.orgName ?? ""} ${c.city ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
  const shown = filtered.slice(0, 300);
  const allShownSelected = shown.length > 0 && shown.every((c) => selected.has(c.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    const next = new Set(selected);
    if (allShownSelected) shown.forEach((c) => next.delete(c.id));
    else shown.forEach((c) => next.add(c.id));
    setSelected(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who should get it?</CardTitle>
        <CardDescription>Suppressed contacts and contacts without an email are hidden automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Input placeholder="Search name, email, organization…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" />
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Contact type">
            <option value="">All contact types</option>
            {contactTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select value={stageId} onChange={(e) => setStageId(e.target.value)} aria-label="Pipeline stage">
            <option value="">All stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-900" checked={checkedOnly} onChange={(e) => setCheckedOnly(e.target.checked)} />
            Only verified emails (recommended)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-900" checked={notEmailed} onChange={(e) => setNotEmailed(e.target.checked)} />
            Not emailed yet
          </label>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No leads match"
            description={checkedOnly ? "Try unticking “Only verified emails”, or verify your leads first (Step 2)." : "Adjust the filters or import more leads."}
            action={
              checkedOnly ? (
                <Link href="/verification">
                  <Button variant="secondary">Go to Step 2: Verify</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm">
              <label className="flex items-center gap-2 font-medium text-gray-800">
                <input type="checkbox" className="h-4 w-4 accent-brand-900" checked={allShownSelected} onChange={toggleAll} />
                Select all {shown.length}
                {filtered.length > shown.length ? ` (of ${filtered.length}, refine to see more)` : ""}
              </label>
              <span className="font-semibold text-brand-900">{selected.size} selected</span>
            </div>
            <ul className="max-h-[440px] divide-y divide-gray-100 overflow-y-auto">
              {shown.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                    <input type="checkbox" className="h-4 w-4 accent-brand-900" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">{contactName(c)}</span>
                      <span className="block truncate text-xs text-gray-600">
                        {c.email}
                        {c.orgName ? ` · ${c.orgName}` : ""}
                      </span>
                    </span>
                    {c.contactType ? <Badge tone="brand">{c.contactType}</Badge> : null}
                    <Badge tone={statusTone(c.verification)}>{c.verification ?? "unverified"}</Badge>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onNext} disabled={selected.size === 0}>
            Next: choose message ({selected.size}) <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewStep({
  contacts,
  template,
  snippets,
  mode,
  busy,
  schedule,
  setSchedule,
  todayTime,
  setTodayTime,
  onBack,
  onConfirm,
}: {
  contacts: ContactDTO[];
  template: { subject: string; body: string };
  snippets: MergeSnippet[];
  mode: "single" | "sequence";
  busy: boolean;
  schedule: "now" | "today" | "thursday";
  setSchedule: (s: "now" | "today" | "thursday") => void;
  todayTime: string;
  setTodayTime: (t: string) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [i, setI] = React.useState(0);
  const rendered = React.useMemo(
    () =>
      contacts.map((c) => {
        const ctx = buildMergeContext({
          firstName: c.firstName,
          lastName: c.lastName,
          fullName: c.fullName,
          title: c.title,
          email: c.email,
          organization: { name: c.orgName, city: c.city, country: c.country },
          contactTypeName: c.contactType,
        });
        return renderEmail(template, ctx, snippets);
      }),
    [contacts, template, snippets]
  );
  const withIssues = rendered.filter((r) => r.missing.length || r.missingSnippets.length).length;
  const c = contacts[Math.min(i, contacts.length - 1)];
  const r = rendered[Math.min(i, rendered.length - 1)];

  if (!c || !r) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check each email</CardTitle>
        <CardDescription>
          {mode === "sequence" ? "This is the first email of the sequence. " : ""}
          Every email gets a short opt-out line at the bottom automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {withIssues ? (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {withIssues} email{withIssues === 1 ? " has" : "s have"} missing fields. They&apos;ll be added, but you&apos;ll need to
            edit them before they can be sent. Tip: use a fallback like {"{{firstName|there}}"}.
          </p>
        ) : null}

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="Previous email">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
          </Button>
          <span className="text-sm font-medium text-gray-700" aria-live="polite">
            {i + 1} of {contacts.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setI((x) => Math.min(contacts.length - 1, x + 1))}
            disabled={i >= contacts.length - 1}
            aria-label="Next email"
          >
            Next <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="space-y-1 border-b border-gray-100 px-5 py-3 text-sm">
            <p className="text-gray-600">
              To: <span className="font-medium text-gray-900">{contactName(c)}</span> &lt;{c.email}&gt;
            </p>
            <p className="font-semibold text-gray-900">{r.subject || "(no subject)"}</p>
          </div>
          <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-gray-800">{r.body}</div>
          <div className="border-t border-dashed border-gray-200 px-5 py-3 text-xs text-gray-500">
            -- Not relevant? Just reply &quot;unsubscribe&quot; and I won&apos;t email again.
          </div>
        </div>
        {r.missing.length || r.missingSnippets.length ? (
          <p className="text-xs text-amber-900">
            Missing for this lead: {[...r.missing, ...r.missingSnippets.map((s) => `snippet ${s}`)].join(", ")}
          </p>
        ) : null}

        {mode === "sequence" ? (
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
            Sequences send when you click Send in Ready to send; the follow-ups are then scheduled automatically.
          </p>
        ) : (
          <fieldset className="rounded-xl border border-gray-200 p-4">
            <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-brand-950">
              <CalendarClock className="h-4 w-4" aria-hidden /> When should these send?
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <ScheduleOption active={schedule === "thursday"} onClick={() => setSchedule("thursday")} title="Next Thursday" text="9am Singapore time — best for cold outreach" />
              <ScheduleOption active={schedule === "today"} onClick={() => setSchedule("today")} title="Later today" text="At a time you pick (SGT)" />
              <ScheduleOption active={schedule === "now"} onClick={() => setSchedule("now")} title="No schedule" text="Sits in Ready to send until you click Send" />
            </div>
            {schedule === "today" ? (
              <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                Send today at
                <input
                  type="time"
                  value={todayTime}
                  onChange={(e) => setTodayTime(e.target.value)}
                  className="h-9 rounded-lg border border-gray-300 px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
                <span className="text-gray-500">Singapore time</span>
              </label>
            ) : null}
            <p className="mt-3 text-xs text-gray-500">
              Scheduled emails are released by a job that runs every ~10 minutes, so timing is approximate. Your{" "}
              daily limit and suppression checks still apply.
            </p>
          </fieldset>
        )}

        <div className="flex justify-between">
          <Button variant="secondary" onClick={onBack} disabled={busy}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Button>
          <Button variant="accent" size="lg" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Inbox className="h-4 w-4" aria-hidden />}
            {mode === "sequence" || schedule === "now"
              ? `Add ${contacts.length} to Ready to send`
              : schedule === "thursday"
              ? `Schedule ${contacts.length} for Thursday`
              : `Schedule ${contacts.length} for today`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
