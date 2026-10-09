"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPin } from "lucide-react";

import { PersonDots } from "@/components/person-dots";
import { categoryMeta } from "@/lib/config";
import type { AgendaDay } from "@/lib/events";
import type { Person } from "@/lib/types";
import { cn, dayLabel } from "@/lib/utils";

/** Agenda-liste gruppert per dag, med filter per person. */
export function Agenda({ days, people, todayKey }: { days: AgendaDay[]; people: Person[]; todayKey: string }) {
  const [filter, setFilter] = useState<string | null>(null);

  const visible = days
    .map((d) => ({
      ...d,
      entries: filter
        ? d.entries.filter((e) => e.event.person_ids.length === 0 || e.event.person_ids.includes(filter))
        : d.entries,
    }))
    .filter((d) => d.entries.length > 0);

  return (
    <div className="mt-4 flex flex-col gap-4">
      {people.length > 1 ? (
        <div role="group" aria-label="Vis hendelser for" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <FilterChip active={filter === null} onClick={() => setFilter(null)} label="Alle" />
          {people.map((p) => (
            <FilterChip
              key={p.id}
              active={filter === p.id}
              onClick={() => setFilter(filter === p.id ? null : p.id)}
              label={p.name}
              color={p.color}
            />
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">Ingenting i kalenderen i denne perioden.</p>
      ) : (
        visible.map((day) => (
          <section key={day.dateKey} aria-labelledby={`dag-${day.dateKey}`} className="flex flex-col gap-2">
            <h2
              id={`dag-${day.dateKey}`}
              className={cn(
                "px-1 text-sm font-semibold",
                day.dateKey === todayKey ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
              )}
            >
              {dayLabel(day.dateKey, todayKey)}
            </h2>
            <ul className="flex flex-col gap-2">
              {day.entries.map(({ event, timeLabel }) => {
                const meta = categoryMeta(event.category);
                return (
                  <li key={`${event.id}-${day.dateKey}`}>
                    <Link
                      href={`/kalender/${event.id}`}
                      className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm"
                    >
                      <span className="mt-0.5 text-xl" aria-hidden>
                        {meta.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{event.title}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-muted)]">
                          <span className="tabular-nums">{timeLabel}</span>
                          {event.location ? (
                            <span className="flex min-w-0 items-center gap-0.5">
                              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                              <span className="truncate">{event.location}</span>
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <PersonDots people={people} ids={event.person_ids} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium",
        active
          ? color
            ? "border-transparent text-white"
            : "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      )}
      style={active && color ? { backgroundColor: color } : undefined}
    >
      {label}
    </button>
  );
}
