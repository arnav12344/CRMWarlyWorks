import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/reminders";
import {
  CalendarClock,
  AlarmClock,
  Inbox,
  FileClock,
  ShieldAlert,
  AlertTriangle,
  CalendarCheck,
  ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Daily action dashboard — the home screen.
 *
 * Shows the founder what to do today with LIVE counts pulled from the DB:
 * follow-ups due today, overdue follow-ups, new replies to handle, drafts
 * awaiting approval, the verification review queue, recent bounces, and
 * upcoming meetings / positive replies. Every card links to the page where
 * the work happens.
 */
export default async function DashboardPage() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    dueToday,
    overdue,
    replies,
    drafts,
    verifyQueue,
    recentBounces,
    positiveContacts,
    totalContacts,
    verifiedContacts,
    sentThisWeek,
    dueTodayList,
    overdueList,
    positiveList,
  ] = await Promise.all([
    prisma.followUp.count({
      where: { status: "pending", dueAt: { gte: startOfToday, lte: endOfToday } },
    }),
    prisma.followUp.count({
      where: { status: "pending", dueAt: { lt: startOfToday } },
    }),
    prisma.emailMessage.count({
      where: { direction: "inbound", status: "replied" },
    }),
    prisma.emailMessage.count({
      where: { direction: "outbound", status: { in: ["draft", "queued"] } },
    }),
    prisma.contact.count({
      where: { email: { not: null }, verificationConsensus: null, suppressed: false },
    }),
    prisma.emailMessage.count({
      where: { status: "bounced", bouncedAt: { gte: sevenDaysAgo } },
    }),
    prisma.contact.count({
      where: { pipelineStage: { isPositive: true }, suppressed: false },
    }),
    prisma.contact.count(),
    prisma.contact.count({ where: { verificationConsensus: { not: null } } }),
    prisma.emailMessage.count({
      where: { direction: "outbound", status: "sent", sentAt: { gte: sevenDaysAgo } },
    }),
    prisma.followUp.findMany({
      where: { status: "pending", dueAt: { gte: startOfToday, lte: endOfToday } },
      orderBy: { dueAt: "asc" },
      take: 6,
      include: { contact: { select: { id: true, fullName: true, email: true, organization: { select: { name: true } } } } },
    }),
    prisma.followUp.findMany({
      where: { status: "pending", dueAt: { lt: startOfToday } },
      orderBy: { dueAt: "asc" },
      take: 6,
      include: { contact: { select: { id: true, fullName: true, email: true, organization: { select: { name: true } } } } },
    }),
    prisma.contact.findMany({
      where: { pipelineStage: { isPositive: true }, suppressed: false },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        organization: { select: { name: true } },
        pipelineStage: { select: { name: true } },
      },
    }),
  ]);

  const actionCards: Array<{
    label: string;
    value: number;
    href: string;
    icon: LucideIcon;
    tone: string;
    hint: string;
  }> = [
    { label: "Follow-ups due today", value: dueToday, href: "/leads", icon: CalendarClock, tone: "text-brand-600 bg-brand-50", hint: "Business-day reminders (Asia/Singapore)" },
    { label: "Overdue follow-ups", value: overdue, href: "/leads", icon: AlarmClock, tone: "text-red-600 bg-red-50", hint: "Slipping through the cracks" },
    { label: "New replies", value: replies, href: "/leads", icon: Inbox, tone: "text-accent-600 bg-accent-50", hint: "Prospects who wrote back" },
    { label: "Drafts to approve", value: drafts, href: "/compose", icon: FileClock, tone: "text-amber-600 bg-amber-50", hint: "Review-before-send queue" },
    { label: "Verification queue", value: verifyQueue, href: "/verification", icon: ShieldAlert, tone: "text-indigo-600 bg-indigo-50", hint: "Emails still to cross-check" },
    { label: "Recent bounces", value: recentBounces, href: "/leads", icon: AlertTriangle, tone: "text-red-600 bg-red-50", hint: "Last 7 days — auto-suppressed" },
  ];

  const glance = [
    { label: "Contacts", value: totalContacts },
    { label: "Verified emails", value: verifiedContacts },
    { label: "Sent this week", value: sentThisWeek },
    { label: "Positive / warm", value: positiveContacts },
  ];

  const timeLabel = formatInTimeZone(now, APP_TIMEZONE, "EEEE, d MMM yyyy");

  return (
    <>
      <PageHeader
        title="Daily action list"
        description={`What needs your attention today — ${timeLabel} (Asia/Singapore).`}
        actions={
          <Link href="/analytics">
            <span className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              View analytics <ArrowUpRight className="h-4 w-4" />
            </span>
          </Link>
        }
      />

      {/* Action cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {actionCards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href} className="group">
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-start justify-between">
                  <div>
                    <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${c.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="text-3xl font-semibold text-gray-900">{c.value}</p>
                    <p className="mt-1 text-sm font-medium text-gray-700">{c.label}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{c.hint}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-brand-500" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* At-a-glance strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {glance.map((g) => (
          <Card key={g.label}>
            <CardContent>
              <p className="text-sm text-gray-500">{g.label}</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{g.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FollowUpList
          title="Due today"
          icon={<CalendarClock className="h-5 w-5" />}
          emptyTitle="Nothing due today"
          emptyBody="You're all caught up. Enjoy the calm."
          items={dueToday === 0 ? [] : dueTodayList}
          now={now}
        />
        <FollowUpList
          title="Overdue"
          icon={<AlarmClock className="h-5 w-5" />}
          emptyTitle="No overdue follow-ups"
          emptyBody="Great — nothing is slipping."
          items={overdue === 0 ? [] : overdueList}
          now={now}
          overdue
        />
      </div>

      {/* Upcoming meetings / positive replies */}
      <Card>
        <CardContent>
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
              <CalendarCheck className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold text-gray-900">
              Warm prospects &amp; upcoming meetings
            </h3>
          </div>
          {positiveList.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="h-5 w-5" />}
              title="No warm prospects yet"
              description="Positive replies and booked meetings will surface here as your pipeline advances."
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {positiveList.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="truncate text-sm font-medium text-gray-900 hover:text-brand-600"
                    >
                      {c.fullName || c.email || "Unknown contact"}
                    </Link>
                    <p className="truncate text-xs text-gray-500">
                      {c.organization?.name ?? "—"}
                    </p>
                  </div>
                  <Badge tone="success">{c.pipelineStage?.name ?? "Positive"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

interface FollowUpItem {
  id: string;
  dueAt: Date;
  reason: string | null;
  contact: {
    id: string;
    fullName: string | null;
    email: string | null;
    organization: { name: string } | null;
  };
}

function FollowUpList({
  title,
  icon,
  emptyTitle,
  emptyBody,
  items,
  overdue = false,
}: {
  title: string;
  icon: React.ReactNode;
  emptyTitle: string;
  emptyBody: string;
  items: FollowUpItem[];
  now: Date;
  overdue?: boolean;
}) {
  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex items-center gap-2">
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
              overdue ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600"
            }`}
          >
            {icon}
          </span>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        </div>
        {items.length === 0 ? (
          <EmptyState icon={icon} title={emptyTitle} description={emptyBody} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <Link
                    href={`/contacts/${f.contact.id}`}
                    className="truncate text-sm font-medium text-gray-900 hover:text-brand-600"
                  >
                    {f.contact.fullName || f.contact.email || "Unknown contact"}
                  </Link>
                  <p className="truncate text-xs text-gray-500">
                    {f.contact.organization?.name ?? "—"} · {f.reason ?? "Follow-up"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-gray-500">
                  {formatInTimeZone(f.dueAt, APP_TIMEZONE, "d MMM, HH:mm")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
