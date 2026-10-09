"use client";

import { useMemo, useState } from "react";

import { buildAgenda } from "@/lib/events";
import type { CalendarEvent, Person } from "@/lib/types";
import { cn } from "@/lib/utils";

import { Agenda } from "./agenda";
import type { CalendarMode } from "./view-toggle";
import { WeekView } from "./week-view";

/** Filter per person + valgt visning (Uker eller Liste). */
export function CalendarView({
  mode,
  events,
  people,
  fromKey,
  toKey,
  weeks,
  todayKey,
}: {
  mode: CalendarMode;
  events: CalendarEvent[];
  people: Person[];
  fromKey: string;
  toKey: string;
  weeks: number;
  todayKey: string;
}) {
  const [filter, setFilter] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter ? events.filter((e) => e.person_ids.length === 0 || e.person_ids.includes(filter)) : events),
    [events, filter]
  );

  return (
    <div className="flex flex-col gap-3">
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

      <div>
        {mode === "uker" ? (
          <WeekView events={visible} people={people} fromKey={fromKey} weeks={weeks} todayKey={todayKey} />
        ) : (
          <Agenda days={buildAgenda(visible, fromKey, toKey)} people={people} todayKey={todayKey} />
        )}
      </div>
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
