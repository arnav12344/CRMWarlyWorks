import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Optional "Step 2 of 4" style eyebrow. */
  eyebrow?: string;
  className?: string;
}

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-700">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-gray-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
