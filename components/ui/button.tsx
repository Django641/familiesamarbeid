import * as React from "react";

import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "default" | "sm" | "lg" | "icon";

const variantClass: Record<Variant, string> = {
  default:
    "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 active:opacity-80",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-bg)]",
  outline: "border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-surface)]",
  ghost: "bg-transparent hover:bg-[var(--color-surface)]",
  destructive: "bg-[var(--color-danger)] text-white hover:opacity-90",
};

const sizeClass: Record<Size, string> = {
  default: "h-12 px-5 py-2",
  sm: "h-11 px-3 text-sm",
  lg: "h-14 px-6 text-lg",
  icon: "h-11 w-11",
};

export function buttonClass(variant: Variant = "default", size: Size = "default", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variantClass[variant],
    sizeClass[size],
    className
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={buttonClass(variant, size, className)} {...props} />
  )
);
Button.displayName = "Button";
