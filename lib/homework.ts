// Lekser: ren logikk (uke, dager, sammenslåing av ukeplaner). Ingen "use client"/server-only —
// brukes av sider, klientkomponenter og enhetstester. Spesifikasjon: docs/UKEPLAN.md.

import type { CalendarEvent, HomeworkItem } from "@/lib/types";
import { addDays } from "@/lib/utils";
import { isoWeek, mondayOf } from "@/lib/week-layout";
import { type AiWeeklyPlan, isDateKey, isDuplicateEvent, normalizeTitle, type PlanDraft, type PlanRow } from "@/lib/weekly-plan-draft";

/** Et element slik klienten ser det: elementet pluss barnet det gjelder (via uka). */
export type HomeworkEntry = Pick<
  HomeworkItem,
  "id" | "kind" | "due_date" | "text" | "done" | "done_at" | "source" | "position"
> & { person_id: string };

/** Skolen er ferdig for dagen kl. 14: etter det handler «lekser» om neste skoledag. */
export const SCHOOL_CUTOFF = "14:00";

const MONTHS = ["jan.", "feb.", "mars", "apr.", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des."];
const WEEKDAY_SHORT = ["Sø", "Ma", "Ti", "On", "To", "Fr", "Lø"];

/** 0 = søndag … 6 = lørdag. */
export function weekdayIndex(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

export function weekdayShort(dateKey: string): string {
  return WEEKDAY_SHORT[weekdayIndex(dateKey)];
}

function dayMonth(dateKey: string): { day: number; month: string } {
  const [, m, d] = dateKey.split("-").map(Number);
  return { day: d, month: MONTHS[m - 1] };
}

/** «Uke 43 · 19.–23. okt.» (mandag–fredag). */
export function weekLabel(weekStart: string): string {
  const from = dayMonth(weekStart);
  const to = dayMonth(addDays(weekStart, 4));
  const range =
    from.month === to.month
      ? `${from.day}.–${to.day}. ${to.month}`
      : `${from.day}. ${from.month}–${to.day}. ${to.month}`;
  return `Uke ${isoWeek(weekStart)} · ${range}`;
}

/** Fra fredag kl. 14 og i helga er det neste uke som gjelder. */
export function isWeekendMode(todayKey: string, time: string): boolean {
  const dow = weekdayIndex(todayKey);
  return dow === 0 || dow === 6 || (dow === 5 && time >= SCHOOL_CUTOFF);
}

/** Uka Lekser åpner på: denne uka, men fra fredag kl. 14 neste uke hvis den finnes. */
export function defaultWeekStart(todayKey: string, time: string, nextWeekExists: boolean): string {
  const thisMonday = mondayOf(todayKey);
  return isWeekendMode(todayKey, time) && nextWeekExists ? addDays(thisMonday, 7) : thisMonday;
}

export type HomeDay = { dateKey: string; title: "Lekser i dag" | "Lekser til i morgen" | "Lekser til mandag" };

/**
 * Hjem-kortet: før kl. 14 «i dag», etter «til i morgen». Fredag etter 14 og i helga → mandag.
 * (Før kl. 14 i helga er det også mandag som venter.)
 */
export function homeworkDayFor(todayKey: string, time: string): HomeDay {
  const dow = weekdayIndex(todayKey);
  const weekend = dow === 0 || dow === 6;
  if (!weekend && time < SCHOOL_CUTOFF) return { dateKey: todayKey, title: "Lekser i dag" };
  if (weekend || dow === 5) return { dateKey: addDays(mondayOf(todayKey), 7), title: "Lekser til mandag" };
  return { dateKey: addDays(todayKey, 1), title: "Lekser til i morgen" };
}

export type DayGroup = { dateKey: string; entries: HomeworkEntry[] };

const byPosition = (a: HomeworkEntry, b: HomeworkEntry, order?: Map<string, number>) =>
  (order ? (order.get(a.person_id) ?? 0) - (order.get(b.person_id) ?? 0) : 0) ||
  a.position - b.position ||
  a.text.localeCompare(b.text, "nb");

/**
 * «Hele uka» først, så dagene mandag–fredag som har noe (helg bare hvis noe står der).
 * `goals` er «Mål:»-linjene, uten avkrysning. `childOrder` (Begge): sorter på barn først, så posisjon.
 */
export function groupWeek(entries: HomeworkEntry[], childOrder?: Map<string, number>): { goals: HomeworkEntry[]; wholeWeek: HomeworkEntry[]; days: DayGroup[] } {
  const goals = entries.filter((e) => e.kind === "mal").sort((a, b) => byPosition(a, b, childOrder));
  const homework = entries.filter((e) => e.kind === "lekse");
  const wholeWeek = homework.filter((e) => !e.due_date).sort((a, b) => byPosition(a, b, childOrder));
  const byDay = new Map<string, HomeworkEntry[]>();
  for (const e of homework) {
    if (!e.due_date) continue;
    byDay.set(e.due_date, [...(byDay.get(e.due_date) ?? []), e]);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, list]) => ({ dateKey, entries: list.sort((a, b) => byPosition(a, b, childOrder)) }));
  return { goals, wholeWeek, days };
}

/** Navnet på originalen: «Ukeplan Ada uke 43» (flere filer: «… (2)»). */
export function planDocumentName(childName: string, weekStart: string, index = 0): string {
  const base = `Ukeplan ${childName} uke ${isoWeek(weekStart)}`;
  return index === 0 ? base : `${base} (${index + 1})`;
}

// ---------------------------------------------------------------------
// Godkjenningsark: flere filer for samme barn slås sammen
// ---------------------------------------------------------------------

/** Slår sammen utkast for samme barn/uke (flere skjermbilder). Like rader (gruppe, tekst, dag) tas bare med én gang. */
export function mergeDrafts(drafts: PlanDraft[]): PlanDraft {
  if (drafts.length === 1) return drafts[0];
  const known = drafts.find((d) => !d.weekGuessed);
  const seen = new Set<string>();
  const rows: PlanRow[] = [];
  for (const d of drafts) {
    for (const r of d.rows) {
      const key = `${r.group}|${normalizeTitle(r.text) || r.text.trim().toLowerCase()}|${r.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(r);
    }
  }
  return {
    personId: drafts.find((d) => d.personId)?.personId ?? "",
    weekStart: (known ?? drafts[0]).weekStart,
    weekGuessed: !known,
    rows: rows.map((r, i) => ({ ...r, key: `${r.group}-${i}` })),
    explanation: [...new Set(drafts.map((d) => d.explanation.trim()).filter(Boolean))].join(" "),
  };
}

/**
 * Fant ikke AI-en uka, utledes den fra datoene i svaret: mandagen de fleste datoene ligger i.
 * Returnerer "" når svaret ikke har noen datoer.
 */
export function inferWeekStart(ai: Pick<AiWeeklyPlan, "week_start" | "homework" | "calendar">): string {
  if (isDateKey(ai.week_start)) return mondayOf(ai.week_start);
  const counts = new Map<string, number>();
  for (const d of [...ai.homework.map((h) => h.due), ...ai.calendar.map((c) => c.date)]) {
    if (!isDateKey(d)) continue;
    const monday = mondayOf(d);
    counts.set(monday, (counts.get(monday) ?? 0) + 1);
  }
  // Flest datoer vinner; ved likt antall den tidligste uka.
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

/** Er det nøyaktig ett kjent barn blant utkastene, hører utkast med ukjent barn til det barnet. */
export function assignUnknownToSoleChild(
  drafts: PlanDraft[],
  events: CalendarEvent[],
  today: string,
  /** Per utkast: false = skal ikke tildeles (f.eks. en hel PDF-plan som kan være det andre barnets). */
  canAssign: boolean[] = []
): PlanDraft[] {
  const known = [...new Set(drafts.map((d) => d.personId).filter(Boolean))];
  if (known.length !== 1) return drafts;
  return drafts.map((d, i) =>
    d.personId || canAssign[i] === false
      ? d
      : { ...d, personId: known[0], rows: d.rows.map((r) => recheckRow(r, events, known[0], today)) }
  );
}

/** Oppdaterer «finnes allerede»/«passert» for en kalenderrad etter at dag eller barn er endret. Ikke-kalenderrader er uendret. */
export function recheckRow(row: PlanRow, events: CalendarEvent[], personId: string, today: string): PlanRow {
  if (row.group !== "kalender") return row;
  const duplicate = isDuplicateEvent(row, events, personId);
  const past = Boolean(row.date) && row.date < today;
  if (duplicate === row.duplicate && past === row.past) return row;
  // Har brukeren selv huket av/på, beholdes valget.
  return { ...row, duplicate, past, selected: row.userSelected ? row.selected : Boolean(row.date) && !duplicate && !past };
}

/** Flytter lekser (ikke kalender) en uke fram/tilbake når uka i arket endres; datoer følger med. */
export function shiftHomeworkDates(rows: PlanRow[], deltaDays: number): PlanRow[] {
  return rows.map((r) => (r.group === "lekse" && r.date ? { ...r, date: addDays(r.date, deltaDays) } : r));
}

// ---------------------------------------------------------------------
// Erstatt uka: behold avkrysning for identisk tekst
// ---------------------------------------------------------------------

type DoneInfo = Pick<HomeworkItem, "kind" | "text" | "done" | "done_at">;

const doneKey = (e: Pick<HomeworkItem, "kind" | "text">) => `${e.kind}|${e.text.trim().toLocaleLowerCase("nb-NO")}`;

/** For hvert nytt element: avkrysningen fra et gammelt element med identisk tekst (ellers ikke gjort). */
export function carryOverDone(
  old: DoneInfo[],
  next: Pick<HomeworkItem, "kind" | "text">[]
): { done: boolean; done_at: Date | null }[] {
  const doneByKey = new Map<string, DoneInfo>();
  for (const o of old) if (o.done && !doneByKey.has(doneKey(o))) doneByKey.set(doneKey(o), o);
  return next.map((n) => {
    const hit = n.kind === "lekse" ? doneByKey.get(doneKey(n)) : undefined;
    return hit ? { done: true, done_at: hit.done_at } : { done: false, done_at: null };
  });
}

/** Hjem-kortet: åpne lekser som skal være ferdige på dagen, per barn (rekkefølge som i `childIds`). */
export function homeworkForDay(entries: HomeworkEntry[], dateKey: string, childIds: string[]) {
  return childIds
    .map((personId) => ({
      personId,
      entries: entries
        .filter((e) => e.person_id === personId && e.kind === "lekse" && !e.done && e.due_date === dateKey)
        .sort((a, b) => byPosition(a, b)),
    }))
    .filter((c) => c.entries.length > 0);
}

/** Størst samlet størrelse på filene i ett AI-kall (Vercel tar maks 4,5 MB per forespørsel). */
export const MAX_BATCH_BYTES = 4.2 * 1024 * 1024;

/** PDF-er går ett kall hver. Bilder samles i ett kall så lenge de til sammen er under grensen, ellers nytt kall. */
export function batchUploads<T extends { prepared: { type: string; size: number } }>(items: T[], maxFiles = 8): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    if (item.prepared.type === "application/pdf") {
      batches.push([item]);
      continue;
    }
    if (current.length > 0 && (bytes + item.prepared.size > MAX_BATCH_BYTES || current.length >= maxFiles)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += item.prepared.size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
