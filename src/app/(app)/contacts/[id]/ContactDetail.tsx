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
import { Badge, statusTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { LogSentEmailDialog } from "@/components/LogSentEmailDialog";
import {
  ArrowLeft,
  Mail,
  MailOpen,
  MailX,
  Clock,
  ShieldCheck,
  ListOrdered,
  Ban,
  CalendarClock,
  Activity as ActivityIcon,
} from "lucide-react";

export interface ThreadMessage {
  id: string;
  direction: string;
  subject: string | null;
  body: string | null;
  status: string;
  at: string;
  repliedAt: string | null;
  bouncedAt: string | null;
  error: string | null;
}

export interface TimelineEvent {
  kind: "activity" | "message" | "followup" | "verification";
  at: string;
  title: string;
  tag: string;
}

interface ContactHeader {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  orgName: string | null;
  contactType: string | null;
  stageId: string | null;
  stageName: string | null;
  suppressed: boolean;
  verificationConsensus: string | null;
  mailboxType: string | null;
  likelyIndividual: boolean;
}

interface Option {
  id: string;
  name: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const KIND_ICON: Record<TimelineEvent["kind"], React.ReactNode> = {
  activity: <ActivityIcon className="h-4 w-4" />,
  message: <Mail className="h-4 w-4" />,
  followup: <CalendarClock className="h-4 w-4" />,
  verification: <ShieldCheck className="h-4 w-4" />,
};

export function ContactDetail({
  contact,
  stages,
  verifications,
  enrollments,
  openFollowUps,
  thread,
  timeline,
}: {
  contact: ContactHeader;
  stages: Option[];
  verifications: { id: string; provider: string; result: string | null; quality: string | null; checkedAt: string }[];
  enrollments: { id: string; sequenceName: string; status: string; currentStep: number; stoppedReason: string | null }[];
  openFollowUps: { id: string; dueAt: string; reason: string | null }[];
  thread: ThreadMessage[];
  timeline: TimelineEvent[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [stageId, setStageId] = React.useState(contact.stageId ?? "");

  async function setStage(newStageId: string) {
    setStageId(newStageId);
    setBusy(true);
    await fetch("/api/contacts/stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: contact.id, pipelineStageId: newStageId || null }),
    });
    setBusy(false);
    router.refresh();
  }

  async function verify() {
    setBusy(true);
    await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: contact.id }),
    });
    setBusy(false);
    router.refresh();
  }

  async function scheduleFollowUp() {
    setBusy(true);
    await fetch("/api/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: contact.id, businessDaysOffset: 2 }),
    });
    setBusy(false);
    router.refresh();
  }

  async function toggleSuppress() {
    setBusy(true);
    await fetch("/api/contacts/suppress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: contact.id, suppressed: !contact.suppressed }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      {/* Header */}
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">{contact.name}</h1>
              {contact.suppressed ? (
                <Badge tone="danger">
                  <Ban className="mr-1 h-3 w-3" /> Suppressed
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-gray-500">
              {contact.title ? `${contact.title} · ` : ""}
              {contact.orgName ?? "No organization"}
            </p>
            <p className="text-sm text-gray-500">{contact.email ?? "No email"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {contact.contactType ? <Badge tone="brand">{contact.contactType}</Badge> : null}
              {contact.verificationConsensus ? (
                <Badge tone={contact.verificationConsensus === "valid" ? "success" : "warning"}>
                  {contact.verificationConsensus}
                </Badge>
              ) : null}
              {contact.mailboxType ? (
                <Badge tone="neutral">
                  {contact.likelyIndividual ? "individual" : contact.mailboxType}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <label className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Pipeline stage
            </label>
            <Select
              className="w-48"
              value={stageId}
              disabled={busy}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="">Unassigned</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        {contact.suppressed || !contact.email ? (
          <Button size="sm" disabled>
            <Mail className="h-4 w-4" aria-hidden /> Write email
          </Button>
        ) : (
          <Link href={`/send?tab=new&contactId=${contact.id}`}>
            <Button size="sm">
              <Mail className="h-4 w-4" aria-hidden /> Write email
            </Button>
          </Link>
        )}
        <LogSentEmailDialog
          contact={{
            id: contact.id,
            name: contact.name,
            // Suppressed contacts can't be logged against (the server refuses too).
            email: contact.suppressed ? null : contact.email,
          }}
          stages={stages}
        />
        <Button size="sm" variant="secondary" onClick={verify} disabled={busy || !contact.email}>
          <ShieldCheck className="h-4 w-4" /> Verify
        </Button>
        <Button size="sm" variant="secondary" onClick={scheduleFollowUp} disabled={busy}>
          <CalendarClock className="h-4 w-4" /> Schedule follow-up
        </Button>
        <Button
          size="sm"
          variant={contact.suppressed ? "secondary" : "danger"}
          onClick={toggleSuppress}
          disabled={busy}
        >
          <Ban className="h-4 w-4" /> {contact.suppressed ? "Unsuppress" : "Suppress"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Email thread (real sends + replies picked up from the inbox) */}
          <Card>
            <CardHeader>
              <CardTitle>Emails</CardTitle>
            </CardHeader>
            <CardContent>
              {thread.length === 0 ? (
                <p className="text-sm text-gray-600">No emails yet.</p>
              ) : (
                <ol className="space-y-3">
                  {thread.map((m) => {
                    const inbound = m.direction === "inbound";
                    return (
                      <li
                        key={m.id}
                        className={
                          inbound
                            ? "mr-8 rounded-xl border border-sky-200 bg-sky-50 p-4"
                            : "ml-8 rounded-xl border border-gray-200 bg-white p-4"
                        }
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs font-medium text-gray-700">
                            {inbound ? <MailOpen className="h-3.5 w-3.5" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
                            {inbound ? "They wrote" : "You sent"} · {fmt(m.at)}
                          </span>
                          <Badge tone={statusTone(m.status)}>{m.status === "queued" ? "ready to send" : m.status}</Badge>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">{m.subject || "(no subject)"}</p>
                        <p className="mt-1 line-clamp-[12] whitespace-pre-wrap text-sm text-gray-800">{m.body}</p>
                        {m.error ? <p className="mt-2 text-xs text-red-800">Error: {m.error}</p> : null}
                        {m.bouncedAt ? (
                          <p className="mt-2 flex items-center gap-1 text-xs text-red-800">
                            <MailX className="h-3.5 w-3.5" aria-hidden /> Bounced {fmt(m.bouncedAt)}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Activity timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-gray-500">No activity yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-gray-200 pl-6">
                  {timeline.map((e, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                        {KIND_ICON[e.kind]}
                      </span>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-800">{e.title}</p>
                        <Badge tone="neutral">{e.tag}</Badge>
                      </div>
                      <p className="text-xs text-gray-400">{fmt(e.at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>


        </div>

        <div className="space-y-6">
          {/* Enrollments */}
          <Card>
            <CardHeader>
              <CardTitle>Sequence enrollments</CardTitle>
            </CardHeader>
            <CardContent>
              {enrollments.length === 0 ? (
                <p className="text-sm text-gray-500">Not enrolled in any sequence.</p>
              ) : (
                <ul className="space-y-2">
                  {enrollments.map((e) => (
                    <li key={e.id} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">
                          {e.sequenceName}
                        </span>
                        <Badge tone={e.status === "active" ? "success" : "neutral"}>
                          {e.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400">
                        Step {e.currentStep + 1}
                        {e.stoppedReason ? ` · stopped: ${e.stoppedReason}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Verifications */}
          <Card>
            <CardHeader>
              <CardTitle>Verification results</CardTitle>
            </CardHeader>
            <CardContent>
              {verifications.length === 0 ? (
                <p className="text-sm text-gray-500">Not verified yet.</p>
              ) : (
                <ul className="space-y-2">
                  {verifications.map((v) => (
                    <li key={v.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{v.provider}</span>
                      <Badge tone={v.result === "valid" ? "success" : "neutral"}>
                        {v.result ?? "unknown"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Open follow-ups */}
          <Card>
            <CardHeader>
              <CardTitle>Open follow-ups</CardTitle>
            </CardHeader>
            <CardContent>
              {openFollowUps.length === 0 ? (
                <p className="text-sm text-gray-500">No pending follow-ups.</p>
              ) : (
                <ul className="space-y-2">
                  {openFollowUps.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <Clock className="h-4 w-4 text-brand-500" />
                      <span>{fmt(f.dueAt)}</span>
                      <span className="text-gray-400">{f.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
