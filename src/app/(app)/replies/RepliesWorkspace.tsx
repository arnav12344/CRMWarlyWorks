"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Clock, Inbox, KanbanSquare, Loader2, MessagesSquare, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";

type Tab = "replies" | "followups" | "pipeline";

interface Stage {
  id: string;
  name: string;
  isPositive: boolean;
  isTerminal: boolean;
}
interface Reply {
  id: string;
  kind: string;
  subject: string;
  body: string;
  at: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  orgName: string | null;
  stageId: string | null;
}
interface FollowUpRow {
  id: string;
  dueAt: string;
  reason: string | null;
  contactId: string;
  contactName: string;
  orgName: string | null;
}
interface PipelineRow {
  id: string;
  name: string;
  orgName: string | null;
  stageId: string | null;
  suppressed: boolean;
}

const KIND: Record<string, { label: string; tone: "info" | "danger" | "warning" | "neutral" }> = {
  replied: { label: "Reply", tone: "info" },
  optout: { label: "Opted out", tone: "danger" },
  autoreply: { label: "Auto-reply", tone: "neutral" },
  bounce_notice: { label: "Bounced", tone: "danger" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export function RepliesWorkspace(props: {
  initialTab: Tab;
  mailConfigured: boolean;
  lastSync: string | null;
  stages: Stage[];
  replies: Reply[];
  followUps: FollowUpRow[];
  pipeline: PipelineRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>(props.initialTab);
  const [syncing, setSyncing] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function checkNow() {
    setSyncing(true);
    setNotice(null);
    const { ok, data } = await post("/api/inbox/sync");
    setSyncing(false);
    if (!ok) setNotice(data.error ?? "Could not check the inbox.");
    else {
      const parts = [
        data.replies && `${data.replies} new repl${data.replies === 1 ? "y" : "ies"}`,
        data.bounces && `${data.bounces} bounce${data.bounces === 1 ? "" : "s"}`,
        data.optouts && `${data.optouts} opt-out${data.optouts === 1 ? "" : "s"}`,
        data.autoreplies && `${data.autoreplies} auto-repl${data.autoreplies === 1 ? "y" : "ies"}`,
      ].filter(Boolean);
      setNotice(parts.length ? `Found ${parts.join(", ")}.` : `Checked ${data.fetched ?? 0} new inbox message(s). Nothing new from your leads.`);
    }
    router.refresh();
  }

  const due = props.followUps.filter((f) => new Date(f.dueAt).getTime() < Date.now() + 24 * 3600 * 1000).length;
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: "replies", label: "Replies", icon: <MessagesSquare className="h-4 w-4" aria-hidden />, count: props.replies.filter((r) => r.kind === "replied").length },
    { id: "followups", label: "Follow-ups", icon: <CalendarClock className="h-4 w-4" aria-hidden />, count: due },
    { id: "pipeline", label: "Pipeline", icon: <KanbanSquare className="h-4 w-4" aria-hidden /> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Replies and pipeline" className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-card">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold",
                tab === t.id ? "bg-brand-900 text-white" : "text-gray-700 hover:bg-gray-100"
              )}
            >
              {t.icon}
              {t.label}
              {t.count ? (
                <span className={cn("rounded-full px-2 text-xs font-bold", tab === t.id ? "bg-emerald-400 text-emerald-950" : "bg-emerald-100 text-emerald-800")}>
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">{props.lastSync ? `Last checked ${fmt(props.lastSync)}` : "Not checked yet"}</span>
          <Button onClick={checkNow} disabled={syncing || !props.mailConfigured}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            Check replies now
          </Button>
        </div>
      </div>

      {notice ? (
        <div role="status" className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800">
          {notice}
        </div>
      ) : null}

      {tab === "replies" ? <RepliesList replies={props.replies} stages={props.stages} /> : null}
      {tab === "followups" ? <FollowUps rows={props.followUps} /> : null}
      {tab === "pipeline" ? <Pipeline rows={props.pipeline} stages={props.stages} /> : null}
    </div>
  );
}

function StageSelect({ contactId, stageId, stages }: { contactId: string; stageId: string | null; stages: Stage[] }) {
  const router = useRouter();
  const [value, setValue] = React.useState(stageId ?? "");
  const [busy, setBusy] = React.useState(false);
  return (
    <Select
      aria-label="Pipeline stage"
      className="h-9 w-44"
      value={value}
      disabled={busy}
      onChange={async (e) => {
        setValue(e.target.value);
        setBusy(true);
        await post("/api/contacts/stage", { contactId, pipelineStageId: e.target.value || null });
        setBusy(false);
        router.refresh();
      }}
    >
      <option value="">No stage</option>
      {stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

function RepliesList({ replies, stages }: { replies: Reply[]; stages: Stage[] }) {
  if (replies.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-5 w-5" aria-hidden />}
        title="No replies yet"
        description="When a lead replies to a@warlyworks.com, it shows up here automatically and their sequence stops."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {replies.map((r) => {
        const k = KIND[r.kind] ?? { label: r.kind, tone: "neutral" as const };
        return (
          <li key={r.id}>
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/contacts/${r.contactId}`} className="font-semibold text-brand-950 hover:underline">
                        {r.contactName}
                      </Link>
                      <Badge tone={k.tone}>{k.label}</Badge>
                    </div>
                    <p className="text-xs text-gray-600">
                      {r.contactEmail}
                      {r.orgName ? ` · ${r.orgName}` : ""} · {fmt(r.at)}
                    </p>
                  </div>
                  {r.kind === "replied" ? <StageSelect contactId={r.contactId} stageId={r.stageId} stages={stages} /> : null}
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-900">{r.subject}</p>
                  <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-sm text-gray-800">{r.body || "(empty)"}</p>
                </div>
                {r.kind === "replied" ? (
                  <p className="text-xs text-gray-600">Reply from Gmail as usual — this CRM already stopped their sequence.</p>
                ) : null}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function FollowUps({ rows }: { rows: FollowUpRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function act(id: string, status: "done" | "snoozed") {
    setBusy(id);
    await post("/api/followups", status === "done" ? { id, status } : { id, status, snoozeBusinessDays: 2 });
    setBusy(null);
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-5 w-5" aria-hidden />}
        title="No follow-ups pending"
        description="After you send a one-off email, reminders appear here 2 and 3 business days later (Singapore time)."
      />
    );
  }
  const now = Date.now();
  return (
    <Card>
      <ul className="divide-y divide-gray-100">
        {rows.map((f) => {
          const overdue = new Date(f.dueAt).getTime() < now;
          return (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <Link href={`/contacts/${f.contactId}`} className="font-medium text-gray-900 hover:underline">
                  {f.contactName}
                </Link>
                <p className="text-xs text-gray-600">
                  {f.orgName ? `${f.orgName} · ` : ""}
                  {f.reason ?? "Follow-up"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={overdue ? "warning" : "neutral"}>
                  <Clock className="h-3 w-3" aria-hidden /> {overdue ? "Overdue · " : ""}
                  {fmt(f.dueAt)}
                </Badge>
                <Link href={`/send?tab=new&contactId=${f.contactId}`}>
                  <Button size="sm" variant="secondary">Write follow-up</Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={() => act(f.id, "snoozed")} disabled={busy === f.id}>
                  Snooze 2 days
                </Button>
                <Button size="sm" onClick={() => act(f.id, "done")} disabled={busy === f.id}>
                  <Check className="h-4 w-4" aria-hidden /> Done
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Pipeline({ rows, stages }: { rows: PipelineRow[]; stages: Stage[] }) {
  if (stages.length === 0) {
    return <EmptyState title="No pipeline stages" description="Add stages under More → Settings." />;
  }
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {stages.map((s) => {
        const inStage = rows.filter((r) => r.stageId === s.id);
        return (
          <section key={s.id} className="w-64 shrink-0" aria-label={s.name}>
            <header className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-brand-950">{s.name}</h3>
              <Badge tone={s.isPositive ? "success" : s.isTerminal ? "neutral" : "brand"}>{inStage.length}</Badge>
            </header>
            <ul className="max-h-[560px] space-y-2 overflow-y-auto rounded-2xl bg-gray-100/70 p-2">
              {inStage.length === 0 ? <li className="px-2 py-4 text-center text-xs text-gray-500">Empty</li> : null}
              {inStage.slice(0, 80).map((r) => (
                <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-card">
                  <Link href={`/contacts/${r.id}`} className="block truncate text-sm font-medium text-gray-900 hover:underline">
                    {r.name}
                  </Link>
                  <p className="truncate text-xs text-gray-600">{r.orgName ?? "—"}</p>
                  <div className="mt-2">
                    <StageSelect contactId={r.id} stageId={r.stageId} stages={stages} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
