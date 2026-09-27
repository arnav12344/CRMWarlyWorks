import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ArrowRight, CalendarClock, CheckCircle2, Mail, Settings2, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { STEPS } from "@/components/steps";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { dayRange, localDayLabel, localHour } from "@/lib/time";
import { APP_TIMEZONE } from "@/lib/reminders";
import { countSentToday } from "@/lib/outreach";
import { getDailySendLimit, loadProviderKeys } from "@/lib/verify/settings";
import { verificationMode } from "@/lib/verify/service";
import { readMailConfig } from "@/lib/mail/config";

export const dynamic = "force-dynamic";

/**
 * Home: the 4 steps as big cards with live counts, a "sent today" ring, and
 * what's due today. The first step with pending work is highlighted.
 */
export default async function HomePage() {
  const now = new Date();
  const { end: endOfToday } = dayRange(now, APP_TIMEZONE);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const [leads, newLeads, toVerify, ready, failed, replies, due, dueList, sentToday, dailyLimit, keys] =
    await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.contact.count({ where: { email: { not: null }, verificationConsensus: null, suppressed: false } }),
      prisma.emailMessage.count({ where: { direction: "outbound", status: { in: ["queued", "approved"] } } }),
      prisma.emailMessage.count({ where: { direction: "outbound", status: "failed" } }),
      prisma.emailMessage.count({ where: { direction: "inbound", status: "replied", createdAt: { gte: weekAgo } } }),
      prisma.followUp.count({ where: { status: "pending", dueAt: { lt: endOfToday } } }),
      prisma.followUp.findMany({
        where: { status: "pending", dueAt: { lt: endOfToday } },
        orderBy: { dueAt: "asc" },
        take: 5,
        include: { contact: { select: { id: true, fullName: true, email: true, organization: { select: { name: true } } } } },
      }),
      countSentToday(prisma, now),
      getDailySendLimit(),
      loadProviderKeys(),
    ]);

  const mailConfigured = readMailConfig() !== null;
  const verifyMode = verificationMode(keys);

  const metrics = [
    { main: `${leads} lead${leads === 1 ? "" : "s"}`, sub: newLeads ? `${newLeads} added this week` : "Import a CSV to get started", cta: leads ? "Add more leads" : "Import leads", pending: leads === 0 },
    { main: toVerify ? `${toVerify} need checking` : "All checked", sub: verifyMode === "live" ? "Uses your verifier credits" : verifyMode === "mock" ? "Dev mode: offline check" : "Add a verifier key in Settings", cta: toVerify ? "Verify emails" : "Review results", pending: toVerify > 0 },
    { main: `${ready} ready to send`, sub: `${sentToday} / ${dailyLimit} sent today${failed ? ` · ${failed} failed` : ""}`, cta: ready ? "Review & send" : "Write an email", pending: ready > 0 || failed > 0 },
    { main: `${replies} repl${replies === 1 ? "y" : "ies"} this week`, sub: `${due} follow-up${due === 1 ? "" : "s"} due`, cta: "See replies", pending: replies > 0 || due > 0 },
  ];
  // Highlight the first step that has work waiting.
  const startIdx = metrics.findIndex((m) => m.pending);

  const hour = localHour(now);
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const pct = Math.min(1, dailyLimit ? sentToday / dailyLimit : 0);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{localDayLabel(now)}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-950">{greeting}, Arnav</h1>
          <p className="mt-1 text-sm text-gray-600">Four steps: add leads, verify, send, follow up.</p>
        </div>
        <SentRing sent={sentToday} limit={dailyLimit} pct={pct} />
      </div>

      {!mailConfigured || verifyMode === "disabled" ? (
        <Link
          href="/settings"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 hover:bg-amber-100"
        >
          <Settings2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Finish setup: </span>
            {!mailConfigured ? "connect your Gmail so emails can be sent. " : ""}
            {verifyMode === "disabled" ? "Add your MillionVerifier or ZeroBounce key to verify emails." : ""}
            <span className="ml-1 font-semibold underline">Open Settings</span>
          </span>
        </Link>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {STEPS.map((s, i) => {
          const m = metrics[i];
          const Icon = s.icon;
          const highlight = i === startIdx;
          return (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "group relative overflow-hidden rounded-2xl border bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40",
                highlight ? "border-accent-400 ring-2 ring-accent-400" : "border-gray-200/80"
              )}
            >
              <span className={cn("absolute inset-x-0 top-0 h-1.5", s.stripe)} aria-hidden />
              <div className="flex h-full flex-col p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold", s.solid)}>
                      {s.n}
                    </span>
                    <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", s.soft)}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                  </div>
                  {highlight ? (
                    <Badge tone="accent">
                      <Sparkles className="h-3 w-3" aria-hidden /> Start here
                    </Badge>
                  ) : !m.pending ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Nothing waiting" />
                  ) : null}
                </div>
                <h2 className="mt-5 text-xl font-bold text-brand-950">{s.label}</h2>
                <p className="mt-1 text-sm text-gray-600">{s.blurb}</p>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{m.main}</p>
                    <p className="text-xs text-gray-600">{m.sub}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white transition-colors group-hover:bg-brand-800">
                    {m.cta} <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-brand-950">
              <CalendarClock className="h-4 w-4 text-emerald-700" aria-hidden /> Due today
            </h2>
            <Link href="/replies?tab=followups" className="text-sm font-medium text-brand-800 hover:underline">
              All follow-ups
            </Link>
          </div>
          {dueList.length === 0 ? (
            <p className="text-sm text-gray-600">Nothing due. You&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {dueList.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/contacts/${f.contact.id}`} className="min-w-0 text-sm hover:underline">
                    <span className="font-medium text-gray-900">{f.contact.fullName || f.contact.email || "Contact"}</span>
                    <span className="text-gray-600"> · {f.contact.organization?.name ?? f.reason ?? "Follow-up"}</span>
                  </Link>
                  <Badge tone={f.dueAt < now ? "warning" : "neutral"}>
                    {f.dueAt < now ? "Overdue" : formatInTimeZone(f.dueAt, APP_TIMEZONE, "HH:mm")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SentRing({ sent, limit, pct }: { sent: number; limit: number; pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white px-4 py-3 shadow-card">
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${sent} of ${limit} emails sent today`}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#E5E7EB" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#F59E0B"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill="#172554">
          {sent}
        </text>
      </svg>
      <div className="text-sm">
        <p className="flex items-center gap-1 font-semibold text-brand-950">
          <Mail className="h-4 w-4" aria-hidden /> Sent today
        </p>
        <p className="text-gray-600">
          {sent} of {limit} · resets at midnight SGT
        </p>
      </div>
    </div>
  );
}
