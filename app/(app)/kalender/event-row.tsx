import Link from "next/link";
import { MapPin } from "lucide-react";

import { PersonDots } from "@/components/person-dots";
import { categoryMeta } from "@/lib/config";
import type { AgendaEntry } from "@/lib/events";
import type { Person } from "@/lib/types";

/** Én hendelse som kort — brukt i Liste og i dagsarket. */
export function EventRow({ entry, people }: { entry: AgendaEntry; people: Person[] }) {
  const { event, timeLabel } = entry;
  const meta = categoryMeta(event.category);
  return (
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
  );
}
