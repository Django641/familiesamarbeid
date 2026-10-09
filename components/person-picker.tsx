"use client";

import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Velg én eller flere personer med store trykkflater (toggle-knapper). */
export function PersonPicker({
  people,
  value,
  onChange,
  label = "Hvem gjelder det?",
}: {
  people: Person[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const allSelected = people.length > 0 && people.every((p) => value.includes(p.id));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {people.map((p) => {
          const on = value.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((id) => id !== p.id) : [...value, p.id])}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                on
                  ? "border-transparent text-white"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
              )}
              style={on ? { backgroundColor: p.color } : undefined}
            >
              {p.name}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={allSelected}
          onClick={() => onChange(allSelected ? [] : people.map((p) => p.id))}
          className="min-h-11 rounded-full border border-dashed border-[var(--color-border)] px-4 text-sm text-[var(--color-muted)]"
        >
          {allSelected ? "Ingen" : "Hele familien"}
        </button>
      </div>
    </fieldset>
  );
}
