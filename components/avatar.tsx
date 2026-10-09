import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Rund initial-avatar i personens farge. */
export function Avatar({ person, size = "md", className }: { person: Person; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden
      title={person.name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        size === "sm" ? "h-6 w-6 text-[11px]" : "h-8 w-8 text-sm",
        className
      )}
      style={{ backgroundColor: person.color }}
    >
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
