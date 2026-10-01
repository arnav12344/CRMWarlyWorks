"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Info, Mail, MailWarning, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS, MORE_LINKS, stepForPath } from "./steps";

/**
 * Slim top bar: which step you're on, today's send count vs the daily limit,
 * and (on small screens, where the sidebar is hidden) the 4 steps as compact
 * tabs plus a "More" menu for Contacts, Sequences & templates, Analytics and
 * Settings.
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
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuId = React.useId();
  const moreActive = MORE_LINKS.find((l) => pathname.startsWith(l.href)) ?? null;

  // Close the menu when you navigate or press Escape.
  React.useEffect(() => setMenuOpen(false), [pathname]);
  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
          <Link href="/" className="flex items-center gap-1 text-gray-600 hover:text-brand-900 md:hidden">
            <Home className="h-4 w-4" aria-hidden />
            <span className="sr-only">Home</span>
          </Link>
          {step ? (
            <span className="flex min-w-0 items-center gap-2 font-medium text-gray-800">
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", step.solid)}>
                {step.n}
              </span>
              <span className="truncate">
                <span className="hidden sm:inline">Step {step.n} of 4 · </span>
                {step.label}
              </span>
            </span>
          ) : moreActive ? (
            <span className="truncate font-medium text-gray-800 md:hidden">{moreActive.label}</span>
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
            {sentToday} / {dailyLimit}
            <span className="hidden sm:inline">sent today</span>
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

      {/* Mobile: everything the sidebar holds on desktop. */}
      {menuOpen ? (
        <nav id={menuId} aria-label="More" className="border-t border-gray-100 px-3 py-2 md:hidden">
          <ul className="grid grid-cols-2 gap-1">
            {MORE_LINKS.map((l) => {
              const active = pathname.startsWith(l.href);
              const Icon = l.icon;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                      active ? "bg-brand-900 text-white" : "text-gray-800 hover:bg-gray-100"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden /> {l.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                href="/about"
                className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                <Info className="h-4 w-4 shrink-0" aria-hidden /> About
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}

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
