import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Numbered progress steps (e.g. Upload → Preview → Map → Import). */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Progress">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "active" ? "step" : undefined}>
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                state === "done" && "bg-emerald-100 text-emerald-800",
                state === "active" && "bg-brand-900 text-white",
                state === "todo" && "bg-gray-100 text-gray-500"
              )}
            >
              {state === "done" ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn("font-medium", state === "active" ? "text-gray-900" : "text-gray-500")}>
              {label}
            </span>
            {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-gray-300" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
