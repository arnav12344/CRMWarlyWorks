import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center",
        className
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-900">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-brand-950">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-gray-600">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
