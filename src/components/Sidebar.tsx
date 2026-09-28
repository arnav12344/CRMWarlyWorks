"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS, MORE_LINKS, stepForPath } from "./steps";

export function Sidebar({ unreadReplies = 0 }: { unreadReplies?: number }) {
  const pathname = usePathname();
  const activeStep = stepForPath(pathname);
  const moreActive = MORE_LINKS.some((l) => pathname.startsWith(l.href));
  const [moreOpen, setMoreOpen] = React.useState(moreActive);

  React.useEffect(() => {
    if (moreActive) setMoreOpen(true);
  }, [moreActive]);

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col bg-brand-900 text-white md:flex">
      <Link href="/" className="flex h-16 items-center gap-3 px-5 hover:bg-white/5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-400 text-base font-extrabold text-brand-950">
          W
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-bold">WarlyWorks</span>
          <span className="text-xs text-brand-200">Outreach CRM</span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className={cn(
            "mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
            pathname === "/" ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"
          )}
        >
          <Home className="h-4 w-4" aria-hidden /> Home
        </Link>

        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-brand-300">Your 4 steps</p>
        <ul className="space-y-1">
          {STEPS.map((s) => {
            const active = activeStep?.n === s.n;
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", s.solid)}>
                    {s.n}
                  </span>
                  <span className="flex-1">{s.label}</span>
                  {s.href === "/replies" && unreadReplies > 0 ? (
                    <span
                      className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-400 px-1.5 text-xs font-bold text-brand-950"
                      aria-label={`${unreadReplies} unread ${unreadReplies === 1 ? "reply" : "replies"}`}
                    >
                      {unreadReplies > 99 ? "99+" : unreadReplies}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-brand-300 hover:bg-white/10 hover:text-white"
          >
            More
            <ChevronDown className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")} aria-hidden />
          </button>
          {moreOpen ? (
            <ul className="mt-1 space-y-1">
              {MORE_LINKS.map((l) => {
                const active = pathname.startsWith(l.href);
                const Icon = l.icon;
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                        active ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden /> {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          href="/about"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-brand-200 hover:bg-white/10 hover:text-white"
        >
          <Info className="h-3.5 w-3.5" aria-hidden /> About WarlyWorks CRM
        </Link>
      </div>
    </aside>
  );
}
