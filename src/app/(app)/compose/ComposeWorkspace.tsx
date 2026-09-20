"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { PenSquare, Inbox, Send, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import {
  renderEmail,
  buildMergeContext,
  type MergeSnippet,
} from "@/lib/merge";

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
  contactType: string | null;
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
interface QueueItem {
  id: string;
  status: string;
  subject: string | null;
  body: string | null;
  createdAt: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
}

type Tab = "compose" | "queue";

const SIMULATED_NOTE =
  "Sends are simulated — no real email is delivered. Everything is tracked in the app so you can demo replies, bounces and follow-ups.";

export function ComposeWorkspace({
  contacts,
  templates,
  snippets,
  queue,
}: {
  contacts: ContactDTO[];
  templates: TemplateDTO[];
  snippets: SnippetDTO[];
  queue: QueueItem[];
}) {
  const [tab, setTab] = React.useState<Tab>("compose");

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
        {SIMULATED_NOTE}
      </div>

      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => setTab("compose")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
            tab === "compose" ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <PenSquare className="h-4 w-4" /> Compose
        </button>
        <button
          onClick={() => setTab("queue")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
            tab === "queue" ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Inbox className="h-4 w-4" /> Review queue
          {queue.length ? (
            <span className="ml-1 rounded-full bg-brand-600 px-2 text-xs text-white">
              {queue.length}
            </span>
          ) : null}
        </button>
      </div>

      {tab === "compose" ? (
        <Composer contacts={contacts} templates={templates} snippets={snippets} />
      ) : (
        <ReviewQueue queue={queue} />
      )}
    </div>
  );
}

/* --------------------------------- Composer --------------------------------- */

function Composer({
  contacts,
  templates,
  snippets,
}: {
  contacts: ContactDTO[];
  templates: TemplateDTO[];
  snippets: SnippetDTO[];
}) {
  const router = useRouter();
  const [contactId, setContactId] = React.useState(contacts[0]?.id ?? "");
  const [templateId, setTemplateId] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const contact = contacts.find((c) => c.id === contactId) ?? null;

  const mergeSnippets: MergeSnippet[] = snippets.map((s) => ({
    label: s.label,
    body: s.body,
  }));

  const context = contact
    ? buildMergeContext({
        firstName: contact.firstName,
        lastName: contact.lastName,
        fullName: contact.fullName,
        title: contact.title,
        email: contact.email,
        organization: {
          name: contact.orgName,
          city: contact.city,
          country: contact.country,
        },
        contactTypeName: contact.contactType,
      })
    : {};

  const preview = renderEmail({ subject, body }, context, mergeSnippets);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }

  function insertSnippet(label: string) {
    const token = `{{snippet:${label}}}`;
    const el = bodyRef.current;
    if (el) {
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      setBody(body.slice(0, start) + token + body.slice(end));
    } else {
      setBody(body + token);
    }
  }

  async function save(status: "draft" | "queued") {
    if (!contactId) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        templateId: templateId || null,
        subject: preview.subject,
        body: preview.body,
        status,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage(status === "queued" ? "Submitted to the review queue." : "Draft saved.");
      if (status === "queued") router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Something went wrong.");
    }
  }

  if (contacts.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<PenSquare className="h-5 w-5" />}
            title="No contactable people yet"
            description="Import leads and verify their emails first. Suppressed contacts are hidden here."
            action={
              <Link href="/import">
                <Button>Go to import</Button>
              </Link>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Write</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Contact</label>
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.fullName ||
                    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                    c.email) ?? "Unknown"}
                  {c.orgName ? ` — ${c.orgName}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Template (optional)
            </label>
            <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">Start from scratch</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Body</label>
            <Textarea
              ref={bodyRef}
              className="min-h-[220px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {snippets.length ? (
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500">
                <Sparkles className="h-3 w-3" /> Insert a proof-point snippet
              </p>
              <div className="flex flex-wrap gap-2">
                {snippets.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => insertSnippet(s.label)}
                    className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    + {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-gray-500">
            To: {contact?.email ?? "—"}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">
              {preview.subject || <span className="text-gray-400">(no subject)</span>}
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-gray-700">
              {preview.body || <span className="text-gray-400">(empty)</span>}
            </pre>
          </div>
          {preview.missing.length || preview.missingSnippets.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {preview.missing.length ? (
                <p>Missing variables: {preview.missing.join(", ")}</p>
              ) : null}
              {preview.missingSnippets.length ? (
                <p>Unknown snippets: {preview.missingSnippets.join(", ")}</p>
              ) : null}
            </div>
          ) : null}
          {message ? (
            <p className="text-sm font-medium text-brand-700">{message}</p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>
              Save draft
            </Button>
            <Button onClick={() => save("queued")} disabled={saving || !subject}>
              Submit to review queue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------- Review queue ------------------------------- */

function ReviewQueue({ queue }: { queue: QueueItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function act(messageId: string, action: string) {
    setBusy(messageId + action);
    const res = await fetch("/api/messages/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, action }),
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.reason ?? data.error ?? "Action failed.");
      return;
    }
    router.refresh();
  }

  if (queue.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="Review queue is empty"
            description="Draft a message or enroll contacts in a sequence to populate the queue."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {queue.map((m) => (
        <Card key={m.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>
                  <Link href={`/contacts/${m.contactId}`} className="hover:underline">
                    {m.contactName}
                  </Link>
                </CardTitle>
                <p className="text-xs text-gray-500">{m.contactEmail}</p>
              </div>
              <Badge tone={m.status === "approved" ? "success" : "warning"}>
                {m.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-900">
                {m.subject || "(no subject)"}
              </p>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-gray-700">
                {m.body}
              </pre>
            </div>
            <div className="flex flex-wrap gap-2">
              {m.status !== "approved" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => act(m.id, "approve")}
                  disabled={busy === m.id + "approve"}
                >
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
              ) : null}
              <Button size="sm" onClick={() => act(m.id, "send")} disabled={busy === m.id + "send"}>
                <Send className="h-4 w-4" /> Send (simulated)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => act(m.id, "reject")}
                disabled={busy === m.id + "reject"}
              >
                <XCircle className="h-4 w-4" /> Send back to drafts
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
