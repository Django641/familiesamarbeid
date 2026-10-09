import { eventEndKey } from "@/lib/events";
import type { CalendarEvent, Person } from "@/lib/types";
import { addDays, osloDateKey, osloTime } from "@/lib/utils";

// Ren layout-logikk for «Uker»-visningen: én rad per uke (man–søn).
// Flerdags- og heldagshendelser blir stolper over dagkolonnene; tidsbestemte
// enkeltdagshendelser blir små merker i dagcellen. Ingen tidssone fra enheten —
// alt går via Oslo-datonøkler.

export const MAX_BAR_LANES = 2;
export const MAX_DAY_MARKS = 3;

export type WeekBar = {
  event: CalendarEvent;
  /** Kolonne 0 (mandag) – 6 (søndag), inklusive. */
  startCol: number;
  endCol: number;
  lane: number;
  /** Hendelsen fortsetter fra uka før / inn i uka etter. */
  continuesLeft: boolean;
  continuesRight: boolean;
};

export type WeekMark = { event: CalendarEvent; time: string };

export type WeekDay = {
  dateKey: string;
  /** Tidsbestemte enkeltdagshendelser, sortert etter klokkeslett. */
  marks: WeekMark[];
  /** Stolper som ikke fikk plass i de synlige banene denne dagen. */
  hiddenBars: number;
  /** Alle hendelser denne dagen (stolper + merker) — til skjermlesertekst og «travel dag». */
  total: number;
};

export type WeekLayout = {
  mondayKey: string;
  weekNumber: number;
  days: WeekDay[];
  bars: WeekBar[];
};

/** Mandagen i uka datoen ligger i. */
export function mondayOf(dateKey: string): string {
  const dow = new Date(`${dateKey}T12:00:00Z`).getUTCDay(); // 0 = søndag
  return addDays(dateKey, dow === 0 ? -6 : 1 - dow);
}

/** ISO 8601-ukenummer (det norske ukenummeret). */
export function isoWeek(dateKey: string): number {
  const thursday = addDays(mondayOf(dateKey), 3);
  const yearStart = `${thursday.slice(0, 4)}-01-01`;
  const days = Math.round((Date.parse(`${thursday}T00:00:00Z`) - Date.parse(`${yearStart}T00:00:00Z`)) / 86_400_000);
  return Math.floor(days / 7) + 1;
}

/** Hendelse med datonøklene regnet ut én gang (Intl-kall er dyre på telefon). */
export type PreparedEvent = {
  event: CalendarEvent;
  startKey: string;
  endKey: string;
  /** Stolpe = heldag eller går over flere dager (reiser, ferier). */
  isBar: boolean;
  time: string;
};

export function prepareEvents(events: CalendarEvent[]): PreparedEvent[] {
  return events.map((event) => {
    const startKey = osloDateKey(event.starts_at);
    const endKey = eventEndKey(event);
    return { event, startKey, endKey, isBar: event.all_day || endKey !== startKey, time: osloTime(event.starts_at) };
  });
}

function colOf(mondayKey: string, dateKey: string): number {
  return Math.round((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${mondayKey}T00:00:00Z`)) / 86_400_000);
}

/**
 * Legger ut én uke. Stolpene sorteres etter personrekkefølge (så de voksnes
 * reiser havner øverst), så startdag og lengde, og pakkes grådig i maks
 * `MAX_BAR_LANES` baner. Det som ikke får plass telles per dag som «+N».
 */
export function layoutWeek(events: PreparedEvent[], mondayKey: string, people: Person[]): WeekLayout {
  const sundayKey = addDays(mondayKey, 6);
  const personRank = new Map(people.map((p, i) => [p.id, i]));
  const rankOf = (e: CalendarEvent) =>
    e.person_ids.length === 0
      ? people.length // hele familien etter enkeltpersoner
      : Math.min(...e.person_ids.map((id) => personRank.get(id) ?? people.length));

  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => ({
    dateKey: addDays(mondayKey, i),
    marks: [],
    hiddenBars: 0,
    total: 0,
  }));

  type Candidate = Omit<WeekBar, "lane"> & { rank: number };
  const candidates: Candidate[] = [];

  for (const { event, startKey, endKey, isBar, time } of events) {
    if (endKey < mondayKey || startKey > sundayKey) continue;

    if (isBar) {
      const from = startKey < mondayKey ? mondayKey : startKey;
      const to = endKey > sundayKey ? sundayKey : endKey;
      candidates.push({
        event,
        startCol: colOf(mondayKey, from),
        endCol: colOf(mondayKey, to),
        continuesLeft: startKey < mondayKey,
        continuesRight: endKey > sundayKey,
        rank: rankOf(event),
      });
    } else {
      days[colOf(mondayKey, startKey)].marks.push({ event, time });
    }
  }

  candidates.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.startCol - b.startCol ||
      b.endCol - b.startCol - (a.endCol - a.startCol) ||
      a.event.title.localeCompare(b.event.title, "nb")
  );

  // Opptatte kolonner per bane. Sorteringen er etter person, ikke startdag,
  // så en ledig luke kan ligge både før og etter stolper som alt er plassert.
  const lanes: boolean[][] = Array.from({ length: MAX_BAR_LANES }, () => Array(7).fill(false));
  const bars: WeekBar[] = [];
  for (const c of candidates) {
    const cols = Array.from({ length: c.endCol - c.startCol + 1 }, (_, i) => c.startCol + i);
    for (const col of cols) days[col].total++;
    const lane = lanes.findIndex((taken) => cols.every((col) => !taken[col]));
    if (lane === -1) {
      for (const col of cols) days[col].hiddenBars++;
      continue;
    }
    for (const col of cols) lanes[lane][col] = true;
    bars.push({
      event: c.event,
      startCol: c.startCol,
      endCol: c.endCol,
      lane,
      continuesLeft: c.continuesLeft,
      continuesRight: c.continuesRight,
    });
  }

  for (const day of days) {
    day.marks.sort((a, b) => a.time.localeCompare(b.time));
    day.total += day.marks.length;
  }

  return { mondayKey, weekNumber: isoWeek(mondayKey), days, bars };
}
