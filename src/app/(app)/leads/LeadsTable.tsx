"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Target, Bookmark, ShieldCheck, ListOrdered, Ban } from "lucide-react";

export interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  orgName: string | null;
  city: string | null;
  contactTypeId: string | null;
  contactType: string | null;
  stageId: string | null;
  stage: string | null;
  verification: string | null;
  suppressed: boolean;
  sent: number;
  replied: number;
  lastActivity: string | null;
}

interface Option {
  id: string;
  name: string;
}

interface SavedSegment {
  name: string;
  filters: Filters;
}

interface Filters {
  q: string;
  contactTypeId: string;
  stageId: string;
  verification: string;
  suppressed: string; // "" | "yes" | "no"
}

const EMPTY_FILTERS: Filters = {
  q: "",
  contactTypeId: "",
  stageId: "",
  verification: "",
  suppressed: "",
};

const SEGMENT_STORE_KEY = "warlyworks.leadSegments";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
  });
}

function verificationTone(v: string | null): "success" | "danger" | "warning" | "neutral" {
  if (v === "valid") return "success";
  if (v === "invalid") return "danger";
  if (v === "risky") return "warning";
  return "neutral";
}

export function LeadsTable({
  rows,
  contactTypes,
  stages,
  sequences,
}: {
  rows: LeadRow[];
  contactTypes: Option[];
  stages: Option[];
  sequences: Option[];
}) {
  const router = useRouter();
  const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [segments, setSegments] = React.useState<SavedSegment[]>([]);
  const [enrollSeq, setEnrollSeq] = React.useState(sequences[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(SEGMENT_STORE_KEY);
      if (raw) setSegments(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  function persistSegments(next: SavedSegment[]) {
    setSegments(next);
    try {
      localStorage.setItem(SEGMENT_STORE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function saveSegment() {
    const name = prompt("Name this segment");
    if (!name) return;
    persistSegments([...segments.filter((s) => s.name !== name), { name, filters }]);
  }

  const filtered = rows.filter((r) => {
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const hay = `${r.name} ${r.email ?? ""} ${r.orgName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.contactTypeId && r.contactTypeId !== filters.contactTypeId) return false;
    if (filters.stageId && r.stageId !== filters.stageId) return false;
    if (filters.verification && r.verification !== filters.verification) return false;
    if (filters.suppressed === "yes" && !r.suppressed) return false;
    if (filters.suppressed === "no" && r.suppressed) return false;
    return true;
  });

  const selectableIds = filtered.filter((r) => !r.suppressed).map((r) => r.id);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  }
  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function bulkEnroll() {
    if (!enrollSeq || selected.size === 0) return;
    setBusy(true);
    setNotice(null);
    const ids = [...selected];
    let enrolled = 0;
    let skipped = 0;
    let queued = 0;
    let error: string | null = null;
    for (let i = 0; i < ids.length; i += 100) {
      const res = await fetch("/api/sequences/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId: enrollSeq, contactIds: ids.slice(i, i + 100) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error = data.error ?? "Enroll failed.";
        break;
      }
      enrolled += data.enrolled;
      skipped += data.skipped;
      queued += data.queuedMessages;
    }
    setBusy(false);
    setSelected(new Set());
    setNotice(
      error ??
        `Enrolled ${enrolled}${skipped ? `, skipped ${skipped} (suppressed or no email)` : ""}. ${queued} first email(s) are waiting in Write & send → Ready to send.`
    );
    router.refresh();
  }

  async function bulkVerify() {
    const ids = rows.filter((r) => selected.has(r.id) && !r.verification && r.email).map((r) => r.id);
    if (ids.length === 0) {
      setNotice("Everyone selected is already verified (or has no email) — no credits used.");
      return;
    }
    if (!confirm(`Verify ${ids.length} unchecked email${ids.length === 1 ? "" : "s"}? This uses verifier credits.`)) return;
    setBusy(true);
    setNotice(null);
    let verified = 0;
    let error: string | null = null;
    for (let i = 0; i < ids.length; i += 10) {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ids.slice(i, i + 10) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error = data.error ?? "Verification failed.";
        break;
      }
      verified += data.verified ?? 0;
      setNotice(`Verifying… ${Math.min(i + 10, ids.length)} / ${ids.length}`);
    }
    setBusy(false);
    setSelected(new Set());
    setNotice(error ?? `Verified ${verified} email${verified === 1 ? "" : "s"}.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-5">
            <Input
              placeholder="Search name, email, org…"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
            <Select
              value={filters.contactTypeId}
              onChange={(e) => setFilters({ ...filters, contactTypeId: e.target.value })}
            >
              <option value="">All contact types</option>
              {contactTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select
              value={filters.stageId}
              onChange={(e) => setFilters({ ...filters, stageId: e.target.value })}
            >
              <option value="">All stages</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              value={filters.verification}
              onChange={(e) => setFilters({ ...filters, verification: e.target.value })}
            >
              <option value="">Any verification</option>
              <option value="valid">Valid</option>
              <option value="risky">Risky</option>
              <option value="invalid">Invalid</option>
              <option value="unknown">Unknown</option>
            </Select>
            <Select
              value={filters.suppressed}
              onChange={(e) => setFilters({ ...filters, suppressed: e.target.value })}
            >
              <option value="">Suppressed: any</option>
              <option value="no">Not suppressed</option>
              <option value="yes">Suppressed only</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={saveSegment}>
              <Bookmark className="h-4 w-4" /> Save segment
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
            {segments.map((seg) => (
              <button
                key={seg.name}
                onClick={() => setFilters(seg.filters)}
                className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                {seg.name}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
          <span className="font-semibold text-brand-900">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <Select
              className="h-8 w-48"
              value={enrollSeq}
              onChange={(e) => setEnrollSeq(e.target.value)}
            >
              {sequences.length === 0 ? <option value="">No sequences</option> : null}
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={bulkEnroll} disabled={busy || !enrollSeq}>
              <ListOrdered className="h-4 w-4" aria-hidden /> Add to sequence
            </Button>
          </div>
          <Button size="sm" variant="secondary" onClick={bulkVerify} disabled={busy}>
            <ShieldCheck className="h-4 w-4" /> Verify
          </Button>
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700">
          {notice}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Target className="h-5 w-5" />}
              title={rows.length === 0 ? "No leads yet" : "No leads match"}
              description={
                rows.length === 0
                  ? "Import a CSV or XLSX of schools, tuition centres or partners to get started."
                  : "Adjust the filters, or import more leads."
              }
              action={
                <Link href="/import">
                  <Button>Import CSV / XLSX</Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </TH>
                <TH>Name</TH>
                <TH>Organization</TH>
                <TH>Type</TH>
                <TH>Stage</TH>
                <TH>Verification</TH>
                <TH>Sent</TH>
                <TH>Replied</TH>
                <TH>Last activity</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((r) => (
                <TR key={r.id} className={r.suppressed ? "bg-red-50/40" : ""}>
                  <TD>
                    <input
                      type="checkbox"
                      disabled={r.suppressed}
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                    />
                  </TD>
                  <TD>
                    <Link href={`/contacts/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.name}
                    </Link>
                    {r.email ? (
                      <div className="text-xs text-gray-500">{r.email}</div>
                    ) : (
                      <Badge tone="neutral" className="mt-1">No email found</Badge>
                    )}
                    {r.suppressed ? (
                      <Badge tone="danger" className="mt-1">
                        <Ban className="mr-1 h-3 w-3" /> Suppressed
                      </Badge>
                    ) : null}
                  </TD>
                  <TD>
                    <div>{r.orgName ?? "—"}</div>
                    <div className="text-xs text-gray-400">{r.city ?? ""}</div>
                  </TD>
                  <TD>{r.contactType ? <Badge tone="brand">{r.contactType}</Badge> : "—"}</TD>
                  <TD>{r.stage ? <Badge>{r.stage}</Badge> : "—"}</TD>
                  <TD>
                    {r.verification ? (
                      <Badge tone={verificationTone(r.verification)}>{r.verification}</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">unverified</span>
                    )}
                  </TD>
                  <TD>{r.sent}</TD>
                  <TD>{r.replied}</TD>
                  <TD className="text-xs text-gray-500">{fmtDate(r.lastActivity)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
