"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { CALENDAR_VIEW_COOKIE } from "@/lib/config";
import { cn } from "@/lib/utils";

export type CalendarMode = "uker" | "liste";

const OPTIONS: ReadonlyArray<{ value: CalendarMode; label: string }> = [
  { value: "uker", label: "Uker" },
  { value: "liste", label: "Liste" },
];

/** Kompakt bryter Uker/Liste i toppfeltet. Valget huskes per telefon i en cookie. */
export function ViewToggle({ mode }: { mode: CalendarMode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: CalendarMode) {
    if (next === mode || pending) return;
    document.cookie = `${CALENDAR_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.replace(`/kalender?visning=${next}`, { scroll: false }));
  }

  return (
    <div role="group" aria-label="Visning" className={cn("flex rounded-xl bg-[var(--color-bg)] p-0.5", pending && "opacity-60")}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={mode === o.value}
          onClick={() => choose(o.value)}
          className={cn(
            "min-h-11 rounded-[10px] px-3 text-sm font-medium",
            mode === o.value
              ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
              : "text-[var(--color-muted)]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
