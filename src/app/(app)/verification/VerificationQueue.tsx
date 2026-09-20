"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  RefreshCw,
  Ban,
  Loader2,
  User,
  Users,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";

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

const CONSENSUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  valid: "success",
  invalid: "danger",
  risky: "warning",
  unknown: "neutral",
};

function resultTone(result: string | null): "success" | "danger" | "warning" | "neutral" {
  switch (result) {
    case "valid":
      return "success";
    case "invalid":
    case "disposable":
      return "danger";
    case "catch_all":
    case "role":
      return "warning";
    default:
      return "neutral";
  }
}

function ProviderResult({ cell }: { cell: ProviderCell | null }) {
  if (!cell || !cell.result) {
    return <span className="text-xs text-gray-400">not run</span>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge tone={resultTone(cell.result)}>{cell.result.replace("_", "-")}</Badge>
      <span className="text-[11px] text-gray-400">
        {cell.mocked ? "mock" : "live"}
        {cell.quality ? ` · ${cell.quality}` : ""}
      </span>
    </div>
  );
}

export function VerificationQueue({
  contacts,
  liveMode,
}: {
  contacts: QueueContact[];
  liveMode: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState("");
  const [batchBusy, setBatchBusy] = React.useState(false);

  const filtered = contacts.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      c.email.toLowerCase().includes(q) ||
      (c.fullName ?? "").toLowerCase().includes(q) ||
      (c.organization ?? "").toLowerCase().includes(q)
    );
  });

  const unverified = contacts.filter((c) => !c.verificationConsensus);

  async function verifyOne(id: string) {
    setBusy((b) => ({ ...b, [id]: "verify" }));
    try {
      await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: id }),
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

  async function suppress(id: string, suppressed: boolean) {
    setBusy((b) => ({ ...b, [id]: "suppress" }));
    try {
      await fetch("/api/contacts/suppress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: id, suppressed }),
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

  async function verifyAllPending() {
    if (unverified.length === 0) return;
    setBatchBusy(true);
    try {
      await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: unverified.map((c) => c.id) }),
      });
      router.refresh();
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search email, name, or organization…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-sm"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {unverified.length} pending · {contacts.length} total
            {liveMode ? "" : " · mock mode"}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={verifyAllPending}
            disabled={batchBusy || unverified.length === 0}
          >
            {batchBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Verify all pending
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Contact</TH>
              <TH>MillionVerifier</TH>
              <TH>ZeroBounce</TH>
              <TH>Consensus</TH>
              <TH>Mailbox</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((c) => {
              const isBusy = Boolean(busy[c.id]);
              const verified = Boolean(c.verificationConsensus);
              return (
                <TR key={c.id} className={c.suppressed ? "opacity-60" : undefined}>
                  <TD>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{c.email}</span>
                      <span className="text-xs text-gray-500">
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
                      <Badge tone={CONSENSUS_TONE[c.verificationConsensus ?? "unknown"]}>
                        {c.verificationConsensus}
                      </Badge>
                    ) : (
                      <span className="text-xs text-gray-400">pending</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600">
                        {c.mailboxType ?? "—"}
                      </span>
                      {c.likelyIndividual ? (
                        <Badge tone="brand" className="gap-1">
                          <User className="h-3 w-3" /> individual
                        </Badge>
                      ) : c.mailboxType === "role" || c.isRoleInbox ? (
                        <Badge tone="warning" className="gap-1">
                          <Users className="h-3 w-3" /> role
                        </Badge>
                      ) : null}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => verifyOne(c.id)}
                        disabled={isBusy}
                      >
                        {busy[c.id] === "verify" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : verified ? (
                          <RefreshCw className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {verified ? "Re-verify" : "Verify"}
                      </Button>
                      <Button
                        variant={c.suppressed ? "ghost" : "danger"}
                        size="sm"
                        onClick={() => suppress(c.id, !c.suppressed)}
                        disabled={isBusy}
                      >
                        {busy[c.id] === "suppress" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Ban className="h-4 w-4" />
                        )}
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
    </div>
  );
}
