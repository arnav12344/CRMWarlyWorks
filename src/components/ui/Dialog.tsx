"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // The overlay itself scrolls, so a dialog taller than the screen (a phone,
  // or any screen with the on-screen keyboard open) can always be scrolled to
  // its buttons. Top-aligned on phones so inputs stay above the keyboard.
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/40"
      onMouseDown={onClose}
    >
      <div className="flex min-h-full items-start justify-center p-3 sm:items-center sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "my-2 w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl sm:my-0",
            className
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4 sm:p-5">
            <div className="flex min-w-0 flex-col gap-1">
              {title ? (
                <h2 className="text-base font-semibold text-gray-900">{title}</h2>
              ) : null}
              {description ? (
                <p className="text-sm text-gray-500">{description}</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-4 sm:p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
