import * as React from "react";

import { cn } from "@/lib/utils";

type Variant = "default" | "muted" | "warning" | "success" | "danger";

const variantClass: Record<Variant, string> = {
  default: "bg-[var(--color-primary)] text-white",
  muted: "bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]",
  warning: "bg-amber-100 text-amber-900 border border-amber-200",
  success: "bg-green-100 text-green-900 border border-green-200",
  danger: "bg-red-100 text-red-900 border border-red-200",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClass[variant],
        className
      )}
      {...props}
    />
  );
}
