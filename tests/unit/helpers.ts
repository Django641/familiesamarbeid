// Små fabrikker for testdata. Ingen database — bare objekter med samme form som radene.
import type { CalendarEvent, Person } from "@/lib/types";
import { osloToIso } from "@/lib/utils";

export function person(id: string, position = 0): Person {
  return { id, name: id, kind: "voksen", color: "#000000", user_id: null, position, hints: "", created_at: new Date() };
}

let counter = 0;

/**
 * Hendelse fra Oslo-tid. `start`/`end` er "YYYY-MM-DD" (heldag) eller "YYYY-MM-DDTHH:MM".
 * Heldag: `end` er siste dag (inklusiv), som i appen.
 */
export function event(
  title: string,
  start: string,
  end: string | null,
  opts: { allDay?: boolean; people?: string[] } = {}
): CalendarEvent {
  const allDay = opts.allDay ?? start.length === 10;
  const toDate = (v: string) => new Date(osloToIso(v.slice(0, 10), v.slice(11) || "00:00"));
  return {
    id: `e${++counter}`,
    title,
    description: null,
    location: null,
    category: allDay ? "reise" : "aktivitet",
    starts_at: toDate(start),
    ends_at: end ? toDate(end) : null,
    all_day: allDay,
    person_ids: opts.people ?? [],
    series_id: null,
    created_by: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}
