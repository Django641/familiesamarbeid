import Link from "next/link";
import { Plus } from "lucide-react";

import type { AgendaDay } from "@/lib/events";
import type { Person } from "@/lib/types";
import { cn, dayLabel } from "@/lib/utils";

import { EventRow } from "./event-row";

/** «Liste»: dager med hendelser, gruppert per dag. */
export function Agenda({ days, people, todayKey }: { days: AgendaDay[]; people: Person[]; todayKey: string }) {
  if (days.length === 0) {
    return <p className="mt-6 text-center text-sm text-[var(--color-muted)]">Ingenting i kalenderen i denne perioden.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => {
        const label = dayLabel(day.dateKey, todayKey);
        return (
          <section key={day.dateKey} aria-labelledby={`dag-${day.dateKey}`} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2
                id={`dag-${day.dateKey}`}
                className={cn(
                  "px-1 text-sm font-semibold",
                  day.dateKey === todayKey ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
                )}
              >
                {label}
              </h2>
              <Link
                href={`/kalender/ny?dato=${day.dateKey}`}
                aria-label={`Ny hendelse ${label.toLowerCase()}`}
                className="-my-2 flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-muted)] hover:text-[var(--color-primary)]"
              >
                <Plus className="h-5 w-5" aria-hidden />
              </Link>
            </div>
            <ul className="flex flex-col gap-2">
              {day.entries.map((entry) => (
                <li key={`${entry.event.id}-${day.dateKey}`}>
                  <EventRow entry={entry} people={people} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
