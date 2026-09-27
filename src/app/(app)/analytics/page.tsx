import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/lib/db";
import { SEED_STAGE_NAME_BY_ROLE } from "@/lib/stageRoles";
import { BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Outreach funnel analytics.
 *
 * The funnel (imported -> verified -> contacted -> replied -> positive ->
 * meeting) is computed from real seeded/live data:
 *   - imported : total contacts in the CRM
 *   - verified : contacts with a verification consensus
 *   - contacted: contacts with at least one SENT outbound message
 *   - replied  : contacts with an inbound reply
 *   - positive : contacts sitting in a stage flagged isPositive
 *   - meeting  : contacts in the stage carrying the stable "meeting" role
 *
 * The meeting count keys off the stable stage `role` (with a fallback to the
 * original seed name), NOT the editable display name, so renaming the
 * "Meeting" stage does not zero the metric.
 */
export default async function AnalyticsPage() {
  // Resolve the meeting stage by its stable machine role, falling back to the
  // original seed display name for DBs seeded before the role column existed.
  const meetingStage =
    (await prisma.pipelineStage.findFirst({ where: { role: "meeting" } })) ??
    (await prisma.pipelineStage.findFirst({
      where: { name: SEED_STAGE_NAME_BY_ROLE.meeting },
    }));

  const [
    imported,
    verified,
    contactedIds,
    repliedIds,
    positive,
    meeting,
    contactTypes,
    stages,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { verificationConsensus: { not: null } } }),
    prisma.emailMessage.findMany({
      where: { direction: "outbound", status: { in: ["sent", "replied", "bounced"] }, sentAt: { not: null } },
      select: { contactId: true },
      distinct: ["contactId"],
    }),
    prisma.emailMessage.findMany({
      where: { direction: "inbound", status: "replied" },
      select: { contactId: true },
      distinct: ["contactId"],
    }),
    prisma.contact.count({ where: { pipelineStage: { isPositive: true } } }),
    meetingStage
      ? prisma.contact.count({ where: { pipelineStageId: meetingStage.id } })
      : Promise.resolve(0),
    prisma.contactType.findMany({
      orderBy: { name: "asc" },
      include: {
        organizations: {
          select: { contacts: { select: { id: true } } },
        },
      },
    }),
    prisma.pipelineStage.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { contacts: true } } },
    }),
  ]);

  const contacted = contactedIds.length;
  const replied = repliedIds.length;

  const funnel = [
    { key: "imported", label: "Imported", value: imported, tone: "bg-gray-400" },
    { key: "verified", label: "Verified", value: verified, tone: "bg-indigo-400" },
    { key: "contacted", label: "Contacted", value: contacted, tone: "bg-brand-500" },
    { key: "replied", label: "Replied", value: replied, tone: "bg-sky-500" },
    { key: "positive", label: "Positive", value: positive, tone: "bg-accent-400" },
    { key: "meeting", label: "Meeting", value: meeting, tone: "bg-emerald-600" },
  ];

  const top = Math.max(imported, 1);

  // Conversion rate relative to the PREVIOUS stage.
  const rateOf = (i: number): number | null => {
    if (i === 0) return null;
    const prev = funnel[i - 1].value;
    if (prev === 0) return null;
    return (funnel[i].value / prev) * 100;
  };

  // Contact-type breakdown (contacts per type).
  const typeBreakdown = contactTypes
    .map((t) => ({
      name: t.name,
      color: t.color,
      count: t.organizations.reduce((sum, o) => sum + o.contacts.length, 0),
    }))
    .sort((a, b) => b.count - a.count);
  const typeMax = Math.max(...typeBreakdown.map((t) => t.count), 1);

  // Pipeline-stage breakdown.
  const stageBreakdown = stages.map((s) => ({
    name: s.name,
    count: s._count.contacts,
    isPositive: s.isPositive,
    isTerminal: s.isTerminal,
  }));
  const stageMax = Math.max(...stageBreakdown.map((s) => s.count), 1);

  if (imported === 0) {
    return (
      <>
        <PageHeader
          title="Analytics"
          description="Outreach funnel and conversion rates."
        />
        <Card>
          <CardContent>
            <EmptyState
              icon={<BarChart3 className="h-5 w-5" />}
              title="No data to chart yet"
              description="Import leads and start sending, then your funnel and reply rates appear here. Run `npm run seed` to populate demo data."
            />
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Your outreach funnel: imported → verified → contacted → replied → positive → meeting."
        actions={
          <Link href="/">
            <span className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Back to home
            </span>
          </Link>
        }
      />

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Outreach funnel</CardTitle>
          <CardDescription>
            Bars are scaled to the imported total. Percentages show conversion
            from the previous stage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {funnel.map((f, i) => {
            const widthPct = Math.max((f.value / top) * 100, f.value > 0 ? 4 : 0);
            const rate = rateOf(i);
            const overall = ((f.value / top) * 100).toFixed(0);
            return (
              <div key={f.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-800">{f.label}</span>
                  <span className="text-gray-500">
                    <span className="font-semibold text-gray-900">{f.value}</span>
                    {rate !== null ? (
                      <span className="ml-2 text-xs text-gray-500">
                        {rate.toFixed(0)}% from {funnel[i - 1].label.toLowerCase()}
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-gray-400">
                        {overall}% of total
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-7 w-full overflow-hidden rounded-md bg-gray-100">
                  <div
                    className={`flex h-full items-center rounded-md ${f.tone} px-2 text-xs font-medium text-white transition-all`}
                    style={{ width: `${widthPct}%` }}
                  >
                    {f.value > 0 ? f.value : null}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-4">
            <Metric label="Reply rate" value={pct(replied, contacted)} hint="replies / contacted" />
            <Metric label="Positive rate" value={pct(positive, contacted)} hint="positive / contacted" />
            <Metric label="Meeting rate" value={pct(meeting, contacted)} hint="meetings / contacted" />
            <Metric label="Verified share" value={pct(verified, imported)} hint="verified / imported" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* By contact type */}
        <Card>
          <CardHeader>
            <CardTitle>By contact type</CardTitle>
            <CardDescription>Contacts across your editable types.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {typeBreakdown.map((t) => (
              <div key={t.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-gray-700">{t.name}</span>
                  <span className="font-medium text-gray-900">{t.count}</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded bg-gray-100">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.max((t.count / typeMax) * 100, t.count > 0 ? 3 : 0)}%`,
                      backgroundColor: t.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* By pipeline stage */}
        <Card>
          <CardHeader>
            <CardTitle>By pipeline stage</CardTitle>
            <CardDescription>Where every contact sits right now.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageBreakdown.map((s) => (
              <div key={s.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-700">
                    {s.name}
                    {s.isPositive ? <Badge tone="success">positive</Badge> : null}
                    {s.isTerminal ? <Badge tone="neutral">terminal</Badge> : null}
                  </span>
                  <span className="font-medium text-gray-900">{s.count}</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded bg-gray-100">
                  <div
                    className={`h-full rounded ${s.isPositive ? "bg-emerald-500" : "bg-brand-700"}`}
                    style={{ width: `${Math.max((s.count / stageMax) * 100, s.count > 0 ? 3 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "—";
  return `${((num / denom) * 100).toFixed(0)}%`;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-400">{hint}</p>
    </div>
  );
}
