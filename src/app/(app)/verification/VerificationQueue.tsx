"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, RefreshCw, Ban, Loader2, User, Users, CheckCircle2, Coins } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import type { VerificationMode } from "@/lib/verify/service";

interface ProviderCell {
  result: string | null;
  quality: string | null;
  mocked: boolean;
}

export interface QueueContact {
  id: string;
  email: string;
  fullName: string | null;
  organization: string | null;
  isRoleInbox: boolean;
  suppressed: boolean;
  verificationConsensus: string | null;
  mailboxType: string | null;
  likelyIndividual: boolean;
  verifiedAt: string | null;
  millionverifier: ProviderCell | null;
  zerobounce: ProviderCell | null;
}

interface CreditInfo {
  mode: VerificationMode;
  providers: { millionverifier: boolean; zerobounce: boolean };
  credits: { millionverifier: number | null; zerobounce: number | null };
  cost: number;
}

const BATCH = 10;

function resultTone(result: string | null) {
  switch (result) {
    case "valid":
      return "success" as const;
    case "invalid":
    case "disposable":
      return "danger" as const;
    case "catch_all":
    case "role":
    case "risky":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function ProviderResult({ cell }: { cell: ProviderCell | null }) {
  if (!cell || !cell.result) return <span className="text-xs text-gray-500">not run</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge tone={resultTone(cell.result)}>{cell.result.replace("_", "-")}</Badge>
      <span className="text-[11px] text-gray-500">{cell.mocked ? "offline check" : "live"}</span>
    </div>
  );
}

/** Lowest known remaining balance across the configured providers. */
function remainingCredits(info: CreditInfo | null): number | null {
  if (!info) return null;
  const vals = [
    info.providers.millionverifier ? info.credits.millionverifier : undefined,
    info.providers.zerobounce ? info.credits.zerobounce : undefined,
  ].filter((v): v is number => typeof v === "number");
  return vals.length ? Math.min(...vals) : null;
}

export function VerificationQueue({
  contacts,
  mode,
  unverifiedCount,
}: {
  contacts: QueueContact[];
  mode: VerificationMode;
  unverifiedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState("");
  const [confirm, setConfirm] = React.useState<{ ids: string[]; info: CreditInfo | null; force?: boolean } | null>(null);
  const [run, setRun] = React.useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const disabled = mode === "disabled";

  const filtered = contacts.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      c.email.toLowerCase().includes(q) ||
      (c.fullName ?? "").toLowerCase().includes(q) ||
      (c.organization ?? "").toLowerCase().includes(q)
    );
  });
  const unchecked = contacts.filter((c) => !c.verificationConsensus && !c.suppressed);

  async function openConfirm(ids: string[], force = false) {
    if (!ids.length) return;
    const res = await fetch(`/api/verify?count=${ids.length}`);
    const info = res.ok ? ((await res.json()) as CreditInfo) : null;
    if (info?.mode === "mock") {
      // Offline dev check costs nothing — skip the dialog.
      await runBatches(ids, force);
      return;
    }
    setConfirm({ ids, info, force });
  }

  async function runBatches(ids: string[], force = false) {
    setConfirm(null);
    setNotice(null);
    setRun({ done: 0, total: ids.length });
    let verified = 0;
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const body = force && slice.length === 1 ? { contactId: slice[0], force: true } : { contactIds: slice };
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error ?? "Verification stopped.");
        break;
      }
      verified += typeof data.verified === "number" ? data.verified : data.verified ? 1 : 0;
      setRun({ done: Math.min(i + BATCH, ids.length), total: ids.length });
    }
    setRun(null);
    setNotice((n) => n ?? `Checked ${verified} email${verified === 1 ? "" : "s"}.`);
    router.refresh();
  }

  async function suppress(id: string, suppressed: boolean) {
    setBusy((b) => ({ ...b, [id]: "suppress" }));
    try {
      await fetch("/api/contacts/suppress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: id, suppressed, reason: "Manually suppressed" }),
      });
      router.refresh();
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[id];
        return next;
      });
    }
  }

  const left = remainingCredits(confirm?.info ?? null);
  const perAddress = confirm?.info ? (confirm.info.providers.millionverifier ? 1 : 0) + (confirm.info.providers.zerobounce ? 1 : 0) : 1;
  const affordable = left === null ? confirm?.ids.length ?? 0 : Math.min(confirm?.ids.length ?? 0, Math.floor(left / Math.max(1, perAddress)));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-lg font-semibold text-brand-950">
            {unverifiedCount ? `${unverifiedCount} email${unverifiedCount === 1 ? "" : "s"} not checked yet` : "Every email has been checked"}
          </p>
          <p className="text-sm text-gray-600">Already-checked addresses are never re-sent to the provider.</p>
        </div>
        <Button size="lg" onClick={() => openConfirm(unchecked.map((c) => c.id))} disabled={disabled || !!run || unchecked.length === 0}>
          {run ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
          Verify {unchecked.length} unchecked
        </Button>
      </div>

      {run ? <ProgressBar value={run.done} max={run.total} label="Verifying" /> : null}
      {notice ? (
        <div role="status" className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800">
          {notice}
        </div>
      ) : null}

      <Input
        placeholder="Search email, name, or organization…"
        aria-label="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="sm:max-w-sm"
      />

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Contact</TH>
              <TH>MillionVerifier</TH>
              <TH>ZeroBounce</TH>
              <TH>Result</TH>
              <TH>Mailbox</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((c) => {
              const isBusy = Boolean(busy[c.id]) || !!run;
              const verified = Boolean(c.verificationConsensus);
              return (
                <TR key={c.id} className={c.suppressed ? "opacity-60" : undefined}>
                  <TD>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{c.email}</span>
                      <span className="text-xs text-gray-600">
                        {c.fullName ?? "—"}
                        {c.organization ? ` · ${c.organization}` : ""}
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <ProviderResult cell={c.millionverifier} />
                  </TD>
                  <TD>
                    <ProviderResult cell={c.zerobounce} />
                  </TD>
                  <TD>
                    {verified ? (
                      <Badge tone={statusTone(c.verificationConsensus)}>{c.verificationConsensus}</Badge>
                    ) : (
                      <span className="text-xs text-gray-500">not checked</span>
                    )}
                  </TD>
                  <TD>
                    {c.likelyIndividual ? (
                      <Badge tone="brand">
                        <User className="h-3 w-3" aria-hidden /> person
                      </Badge>
                    ) : c.mailboxType === "role" || c.isRoleInbox ? (
                      <Badge tone="warning">
                        <Users className="h-3 w-3" aria-hidden /> role inbox
                      </Badge>
                    ) : (
                      <span className="text-xs text-gray-600">{c.mailboxType ?? "—"}</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openConfirm([c.id], verified)}
                        disabled={isBusy || disabled || c.suppressed}
                      >
                        {verified ? <RefreshCw className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                        {verified ? "Re-check" : "Verify"}
                      </Button>
                      <Button
                        variant={c.suppressed ? "ghost" : "danger"}
                        size="sm"
                        onClick={() => suppress(c.id, !c.suppressed)}
                        disabled={isBusy}
                      >
                        {busy[c.id] === "suppress" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />}
                        {c.suppressed ? "Unsuppress" : "Suppress"}
                      </Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Use verification credits?"
        description="Each address costs 1 credit per provider."
      >
        {confirm ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-accent-100 p-4 text-sm text-brand-950">
              <Coins className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <p>
                This uses <strong>{confirm.ids.length * perAddress}</strong> credit{confirm.ids.length * perAddress === 1 ? "" : "s"}
                {left !== null ? (
                  <>
                    {" "}
                    of your <strong>{left}</strong> remaining.
                  </>
                ) : (
                  ". (Couldn't read your balance from the provider.)"
                )}
              </p>
            </div>
            {left !== null && affordable < confirm.ids.length ? (
              <p className="text-sm text-amber-900">
                You only have enough for {affordable}. We&apos;ll verify the first {affordable}.
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button onClick={() => runBatches(confirm.ids.slice(0, affordable), confirm.force)} disabled={affordable === 0}>
                <ShieldCheck className="h-4 w-4" aria-hidden /> Verify {affordable}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
