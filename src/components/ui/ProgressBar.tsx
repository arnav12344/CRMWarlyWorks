import * as React from "react";
import { cn } from "@/lib/utils";

/** Accessible horizontal progress bar. */
export function ProgressBar({
  value,
  max,
  label,
  className,
  tone = "brand",
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
  tone?: "brand" | "accent" | "emerald";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex justify-between text-xs font-medium text-gray-700">
        <span>{label}</span>
        <span>
          {value} / {max}
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            tone === "brand" && "bg-brand-700",
            tone === "accent" && "bg-accent-500",
            tone === "emerald" && "bg-emerald-600"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
