"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Mail, MailWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS, stepForPath } from "./steps";

/**
 * Slim top bar: which step you're on, today's send count vs the daily limit,
 * and (on small screens) the 4 steps as compact tabs.
 */
export function Topbar({
  sentToday,
  dailyLimit,
  mailConfigured,
}: {
  sentToday: number;
  dailyLimit: number;
  mailConfigured: boolean;
}) {
  const pathname = usePathname();
  const step = stepForPath(pathname);
  const nearLimit = sentToday >= dailyLimit * 0.8;

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link href="/" className="flex items-center gap-1 text-gray-600 hover:text-brand-900 md:hidden">
            <Home className="h-4 w-4" aria-hidden />
            <span className="sr-only">Home</span>
          </Link>
          {step ? (
            <span className="flex items-center gap-2 truncate font-medium text-gray-800">
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", step.solid)}>
                {step.n}
              </span>
              <span className="truncate">
                Step {step.n} of 4 · {step.label}
              </span>
            </span>
          ) : null}
        </div>

        {mailConfigured ? (
          <Link
            href="/send"
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset",
              nearLimit ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-brand-50 text-brand-900 ring-brand-100"
            )}
            title="Emails sent today (Singapore time) / daily limit"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            {sentToday} / {dailyLimit} sent today
          </Link>
        ) : (
          <Link
            href="/settings"
            className="flex shrink-0 items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-200"
          >
            <MailWarning className="h-3.5 w-3.5" aria-hidden />
            Email not connected
          </Link>
        )}
      </div>

      {/* Mobile: the 4 steps as tabs */}
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Steps">
        {STEPS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            aria-current={step?.n === s.n ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
              step?.n === s.n ? "bg-brand-900 text-white" : "bg-gray-100 text-gray-700"
            )}
          >
            <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold", s.solid)}>
              {s.n}
            </span>
            {s.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
