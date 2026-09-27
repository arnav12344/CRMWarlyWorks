import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Status colours (used consistently across the app):
 *   success — sent / valid          info    — replied
 *   warning — needs attention       danger  — bounced / failed
 *   neutral — skipped / suppressed  brand   — labels (contact type etc.)
 *   accent  — highlights (marigold fill, navy text)
 */
type Tone = "neutral" | "brand" | "success" | "info" | "warning" | "danger" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-gray-100 text-gray-700 ring-gray-200",
  brand: "bg-brand-50 text-brand-900 ring-brand-100",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  accent: "bg-accent-100 text-brand-950 ring-accent-300",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

/** Map a message / verification status to a badge tone. */
export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case "sent":
    case "valid":
    case "completed":
      return "success";
    case "replied":
      return "info";
    case "queued":
    case "approved":
    case "risky":
    case "sending":
    case "autoreply":
      return "warning";
    case "failed":
    case "bounced":
    case "invalid":
    case "optout":
      return "danger";
    default:
      return "neutral";
  }
}
