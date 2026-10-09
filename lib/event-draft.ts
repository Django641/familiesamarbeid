// Utkast-modell for hendelsesskjemaet. Egen modul (ikke "use client") så både
// server-sider og klientkomponenter kan bruke den.

import { eventEndKey } from "@/lib/events";
import type { CalendarEvent } from "@/lib/types";
import { osloDateKey, osloTime, osloToIso } from "@/lib/utils";

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
