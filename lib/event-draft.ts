// Utkast-modell for hendelsesskjemaet. Egen modul (ikke "use client") så både
// server-sider og klientkomponenter kan bruke den.

import { eventEndKey } from "@/lib/events";
import type { CalendarEvent } from "@/lib/types";
import { addDays, formatDate, osloDateKey, osloTime, osloToIso } from "@/lib/utils";

export type EventDraft = {
  title: string;
  category: string;
  allDay: boolean;
  date: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  description: string;
  personIds: string[];
};

export function draftFromEvent(e: CalendarEvent): EventDraft {
  return {
    title: e.title,
    category: e.category,
    allDay: e.all_day,
    date: osloDateKey(e.starts_at),
    startTime: e.all_day ? "" : osloTime(e.starts_at),
    endDate: eventEndKey(e),
    endTime: !e.all_day && e.ends_at ? osloTime(e.ends_at) : "",
    location: e.location ?? "",
    description: e.description ?? "",
    personIds: e.person_ids,
  };
}

export function emptyDraft(dateKey?: string): EventDraft {
  // Neste hele time i Oslo-tid (siden kjører på server i UTC).
  const inAnHour = new Date(Date.now() + 3_600_000);
  const nextHour = `${osloTime(inAnHour).slice(0, 2)}:00`;
  const date = dateKey ?? osloDateKey(inAnHour);
  return {
    title: "",
    category: "avtale",
    allDay: false,
    date,
    startTime: nextHour,
    endDate: date,
    endTime: "",
    location: "",
    description: "",
    personIds: [],
  };
}

/** Gjør et utkast om til kolonner for events-tabellen. Returnerer feilmelding ved ugyldig input. */
export type EventRowDraft = {
  title: string;
  category: string;
  all_day: boolean;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  description: string | null;
  person_ids: string[];
  series_id?: string;
};

export function draftToRow(d: EventDraft): { row: EventRowDraft } | { error: string } {
  const title = d.title.trim();
  if (!title) return { error: "Skriv en tittel." };
  if (!d.date) return { error: "Velg en dato." };
  const endDate = d.endDate && d.endDate >= d.date ? d.endDate : d.date;

  let starts_at: string;
  let ends_at: string | null;
  if (d.allDay) {
    starts_at = osloToIso(d.date);
    ends_at = endDate !== d.date ? osloToIso(endDate) : null;
  } else {
    if (!d.startTime) return { error: "Velg et klokkeslett, eller huk av for «Hele dagen»." };
    starts_at = osloToIso(d.date, d.startTime);
    ends_at = d.endTime ? osloToIso(endDate, d.endTime) : endDate !== d.date ? osloToIso(endDate, "23:59") : null;
    if (ends_at && ends_at <= starts_at) return { error: "Slutt må være etter start." };
  }
  return {
    row: {
      title,
      category: d.category,
      all_day: d.allDay,
      starts_at,
      ends_at,
      location: d.location.trim() || null,
      description: d.description.trim() || null,
      person_ids: d.personIds,
    },
  };
}

// ---------------------------------------------------------------------
// Gjentakelse: «gjentas hver uke» lager enkeltkopier med felles series_id.
// ---------------------------------------------------------------------

export type Repeat = "none" | "weekly" | "biweekly";
export const REPEATS: Repeat[] = ["none", "weekly", "biweekly"];

/** Maks antall ganger i én serie (hver uke i over et år). */
export const MAX_REPEATS = 60;

/** Forslag til «til og med»: skoleslutt før sommer (19. juni) eller jul (19. des.), minst fire uker fram. */
export function defaultRepeatUntil(date: string): string {
  const year = Number(date.slice(0, 4));
  const earliest = addDays(date, 28);
  return [`${year}-06-19`, `${year}-12-19`, `${year + 1}-06-19`].find((d) => d >= earliest) ?? addDays(date, 70);
}

/** Datoene i serien (første dato først, maks MAX_REPEATS). Uten gjentakelse: bare startdatoen. */
export function repeatDates(date: string, repeat: Repeat, until: string): string[] {
  if (repeat === "none" || !until || until <= date) return [date];
  const step = repeat === "weekly" ? 7 : 14;
  const dates: string[] = [];
  for (let d = date; d <= until && dates.length < MAX_REPEATS; d = addDays(d, step)) dates.push(d);
  return dates;
}

/** Én rad per gang i serien. Flere enn én gang → alle får samme series_id. */
export function expandRepeat(
  d: EventDraft,
  repeat: Repeat,
  until: string,
  seriesId: string
): { rows: EventRowDraft[] } | { error: string } {
  const dates = repeatDates(d.date, repeat, until);
  const step = repeat === "biweekly" ? 14 : 7;
  const rows: EventRowDraft[] = [];
  for (const [i, date] of dates.entries()) {
    const result = draftToRow({ ...d, date, endDate: addDays(d.endDate || d.date, i * step) });
    if ("error" in result) return result;
    rows.push(dates.length > 1 ? { ...result.row, series_id: seriesId } : result.row);
  }
  return { rows };
}

/** «Hver tirsdag kl. 17:30 · 11 ganger, siste 15. des.» */
export function repeatSummary(d: Pick<EventDraft, "date" | "allDay" | "startTime">, repeat: Repeat, until: string): string {
  if (repeat === "none" || !d.date) return "";
  const dates = repeatDates(d.date, repeat, until);
  if (dates.length < 2) return "Bare én gang — velg en senere «til og med»-dato.";
  const weekday = new Date(`${d.date}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "long", timeZone: "UTC" });
  const when = `${repeat === "weekly" ? "Hver" : "Annenhver"} ${weekday}${!d.allDay && d.startTime ? ` kl. ${d.startTime}` : ""}`;
  const cap = dates.length === MAX_REPEATS ? ` (maks ${MAX_REPEATS})` : "";
  return `${when} · ${dates.length} ganger${cap}, siste ${formatDate(dates[dates.length - 1])}`;
}
