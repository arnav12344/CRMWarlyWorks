import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  FileSpreadsheet,
  Filter,
  ListOrdered,
  MailCheck,
  PenSquare,
  Send,
  Settings2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "WarlyWorks — Personalized cold outreach, organized",
  description:
    "WarlyWorks is an all-in-one cold-outreach CRM: import messy scraped lead lists, verify emails, build personalized sequences, send, and track replies — all in one place.",
};

const features = [
  {
    icon: FileSpreadsheet,
    title: "Import messy scraper data",
    description:
      "Drop in CSV or XLSX from any scraper — nested JSON, automatic dedupe, and secret redaction included.",
    tint: "bg-brand-50 text-brand-900",
  },
  {
    icon: ShieldCheck,
    title: "Dual email verification",
    description:
      "MillionVerifier and ZeroBounce consensus checks that only spend credits on addresses you have not checked yet.",
    tint: "bg-accent-100 text-brand-950",
  },
  {
    icon: ListOrdered,
    title: "Personalized sequences",
    description:
      "Build multi-step sequences with business-day follow-ups scheduled in Asia/Singapore time.",
    tint: "bg-brand-50 text-brand-900",
  },
  {
    icon: MailCheck,
    title: "Email & reply tracking",
    description:
      "Replies, bounces and opt-outs are picked up from your inbox automatically.",
    tint: "bg-accent-100 text-brand-950",
  },
  {
    icon: BarChart3,
    title: "Pipeline & funnel analytics",
    description:
      "Track every prospect through your pipeline with clear funnel and stage analytics.",
    tint: "bg-brand-50 text-brand-900",
  },
  {
    icon: Settings2,
    title: "Data-driven contact types",
    description:
      "Configure contact types from your own data — nothing is hardcoded into the product.",
    tint: "bg-accent-100 text-brand-950",
  },
];

const steps = [
  { icon: Upload, label: "Import" },
  { icon: ShieldCheck, label: "Verify" },
  { icon: Filter, label: "Segment" },
  { icon: PenSquare, label: "Compose" },
  { icon: ListOrdered, label: "Sequence" },
  { icon: BarChart3, label: "Track" },
  { icon: CalendarClock, label: "Follow up" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* gradient / blurred background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-white" />
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand-200/50 blur-3xl" />
          <div className="absolute top-10 right-0 h-72 w-72 rounded-full bg-accent-100/60 blur-3xl" />
        </div>

        <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-900 text-base font-bold text-white">
              W
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-gray-900">
                WarlyWorks
              </span>
              <span className="text-xs text-gray-400">Outreach CRM</span>
            </div>
          </div>

          <div className="mt-10 max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              All-in-one cold-outreach CRM
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Personalized cold outreach,{" "}
              <span className="text-brand-900">organized</span>.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-gray-600 sm:text-xl">
              WarlyWorks turns messy scraped lead lists into a clean pipeline.
              Import, verify emails, build personalized sequences, send, and
              track every reply — without stitching together five different
              tools.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-900 px-5 text-base font-medium text-white shadow-sm transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                Open the CRM
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/leads"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 text-base font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                Browse leads
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Everything your outreach needs
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            From raw scraped data to booked replies, WarlyWorks handles the full
            outreach lifecycle in a single workspace.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                className="transition-shadow hover:shadow-md"
              >
                <CardContent className="flex flex-col gap-4">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${feature.tint}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                      {feature.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-y border-gray-100 bg-gray-50/60">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              A clear, repeatable flow from a raw lead list to a tracked
              conversation.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-y-6">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isLast = index === steps.length - 1;
              return (
                <div key={step.label} className="flex items-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-brand-100 bg-white text-brand-900 shadow-card">
                      <Icon className="h-6 w-6" />
                      <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {step.label}
                    </span>
                  </div>
                  {!isLast && (
                    <ArrowRight className="mx-3 h-5 w-5 shrink-0 text-brand-300 sm:mx-4" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <div className="relative overflow-hidden rounded-xl bg-brand-900 px-8 py-12 text-center shadow-card sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute inset-0 -z-0 opacity-40">
            <div className="absolute -top-16 -left-10 h-56 w-56 rounded-full bg-brand-400 blur-3xl" />
            <div className="absolute -bottom-16 -right-10 h-56 w-56 rounded-full bg-accent-500 blur-3xl" />
          </div>
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to organize your outreach?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-100">
              Jump into the CRM and turn your next lead list into real
              conversations.
            </p>
            <div className="mt-8">
              <Link
                href="/"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-base font-medium text-brand-700 shadow-sm transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
              >
                Open the CRM
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-100">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-900 text-sm font-bold text-white">
              W
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-gray-900">
                WarlyWorks
              </span>
              <span className="text-xs text-gray-400">
                Cold outreach, organized.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/"
              className="font-medium text-gray-600 transition-colors hover:text-brand-900"
            >
              Open the CRM
            </Link>
            <span className="text-gray-400">
              © {new Date().getFullYear()} WarlyWorks
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
