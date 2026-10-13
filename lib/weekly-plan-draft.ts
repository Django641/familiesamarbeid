// Ukeplan fra skolen: gjør svaret fra /api/ai/parse-weekly-plan om til godkjenningsrader.
// Ren logikk (ingen "use client", ingen server-only) så klienten og enhetstestene kan bruke den.
// Spesifikasjon: docs/UKEPLAN.md.

import { type EventDraft } from "@/lib/event-draft";
import { eventEndKey } from "@/lib/events";
import type { CalendarEvent, Person } from "@/lib/types";
import { addDays, osloDateKey } from "@/lib/utils";
import { mondayOf } from "@/lib/week-layout";

/** Slik /api/ai/parse-weekly-plan returnerer ukeplanen. */
export type AiWeeklyPlan = {
  /** Navn fra familielista, eller "" når barnet ikke kunne avgjøres. */
  person: string;
  /** Mandag i uka (YYYY-MM-DD), eller "". */
  week_start: string;
  goals: string[];
  /** due = dagen leksa skal være ferdig til (YYYY-MM-DD), "" = hele uka. */
  homework: { text: string; due: string }[];
  calendar: AiPlanCalendar[];
  explanation: string;
};

export type AiPlanCalendar = {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  kind: string;
  notes: string;
};

export type PlanGroup = "kalender" | "lekse" | "mal";
export const PLAN_GROUPS: PlanGroup[] = ["kalender", "lekse", "mal"];
export type CalendarKind = "hendelse" | "ta_med";

/** Kategorien kalenderradene fra ukeplanen får. */
export const PLAN_EVENT_CATEGORY = "skole";

/** Én rad i godkjenningsarket. */
export type PlanRow = {
  key: string;
  group: PlanGroup;
  selected: boolean;
  /** Tittel (kalender) eller tekst (lekse/mål). */
  text: string;
  /**
   * Kalender: dagen hendelsen er (tom = mangler/ugyldig, må velges).
   * Lekse: dagen den skal være ferdig til, "" = hele uka. Mål: alltid "".
   */
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  notes: string;
  kind: CalendarKind;
  /** Finnes allerede i kalenderen (samme dag, barn og nesten lik tittel). */
  duplicate: boolean;
  /** Datoen er passert (kalenderrader). */
  past: boolean;
  /** Brukeren har selv huket av/på raden — da overstyrer ikke dublett-/passertsjekken valget. */
  userSelected?: boolean;
};

export type PlanDraft = {
  /** Barnets person-id, eller "" når AI-en ikke fant barnet (brukeren velger «Gjelder»). */
  personId: string;
  /** Mandag. Faller tilbake til inneværende uke hvis AI-en ikke fant uka — se `weekGuessed`. */
  weekStart: string;
  weekGuessed: boolean;
  rows: PlanRow[];
  explanation: string;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Gyldig kalenderdato "YYYY-MM-DD" (avviser f.eks. 2026-02-30). */
export function isDateKey(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ---------------------------------------------------------------------
// Dublettsjekk
// ---------------------------------------------------------------------

/** Tittel uten emoji, store bokstaver og tegnsetting: «🩳 Gymtøy!» → «gymtøy». */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFC")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣]/gu, " ")
    .toLocaleLowerCase("nb-NO")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * «Nesten lik» tittel: like etter normalisering, eller den korteste (minst fire tegn) står som hele
 * ord i den lengste («Gymtøy» ~ «Gymtøy og drikkeflaske»). Under fire tegn («Tur») teller bare like titler.
 */
export function similarTitles(a: string, b: string): boolean {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 4) return false;
  return ` ${long} `.includes(` ${short} `);
}

/** Finnes det en hendelse samme Oslo-dag (flerdagshendelser dekker hver dag), for samme barn, med lik tittel? */
export function isDuplicateEvent(
  row: { text: string; date: string },
  existing: CalendarEvent[],
  personId: string
): boolean {
  if (!row.date || !normalizeTitle(row.text)) return false;
  return existing.some((e) => {
    if (personId && !e.person_ids.includes(personId)) return false;
    if (row.date < osloDateKey(e.starts_at) || row.date > eventEndKey(e)) return false;
    return similarTitles(row.text, e.title);
  });
}

// ---------------------------------------------------------------------
// AI-svar → rader
// ---------------------------------------------------------------------

/** Barnet AI-en pekte på (navn, uavhengig av store/små bokstaver). Bare personer med kind = barn. */
export function matchChild(name: string, people: Pick<Person, "id" | "name" | "kind">[]): string {
  const wanted = name.trim().toLocaleLowerCase("nb-NO");
  if (!wanted) return "";
  return people.find((p) => p.kind === "barn" && p.name.trim().toLocaleLowerCase("nb-NO") === wanted)?.id ?? "";
}

/**
 * Bygger godkjenningsrader. Alt er forhåndshuket unntatt: kalenderrader som alt finnes i kalenderen,
 * passerte datoer og rader uten gyldig dato. `today` kan settes i tester.
 */
export function draftFromAiPlan(
  ai: AiWeeklyPlan,
  opts: { people: Pick<Person, "id" | "name" | "kind">[]; existingEvents: CalendarEvent[]; today?: string }
): PlanDraft {
  const today = opts.today ?? osloDateKey(new Date());
  const personId = matchChild(ai.person, opts.people);
  const weekGuessed = !isDateKey(ai.week_start);
  const weekStart = mondayOf(weekGuessed ? today : ai.week_start);
  const weekEnd = addDays(weekStart, 6);

  const calendar: PlanRow[] = ai.calendar
    .filter((c) => c.title.trim())
    .map((c) => {
      const kind: CalendarKind = c.kind === "ta_med" ? "ta_med" : "hendelse";
      const date = isDateKey(c.date) ? c.date : "";
      // «Ta med» er alltid heldag. Ugyldig/manglende klokkeslett gir heldag, som i «Fra tekst».
      const allDay = kind === "ta_med" || c.all_day || !TIME_RE.test(c.start_time);
      const row = {
        key: "",
        group: "kalender" as const,
        selected: false,
        text: c.title.trim(),
        date,
        allDay,
        startTime: allDay ? "" : c.start_time,
        endTime: !allDay && TIME_RE.test(c.end_time) ? c.end_time : "",
        notes: c.notes.trim(),
        kind,
        duplicate: false,
        past: false,
      };
      row.duplicate = isDuplicateEvent(row, opts.existingEvents, personId);
      row.past = Boolean(date) && date < today;
      row.selected = Boolean(date) && !row.duplicate && !row.past;
      return row;
    })
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.startTime.localeCompare(b.startTime));

  const homework: PlanRow[] = ai.homework
    .filter((h) => h.text.trim())
    .map((h) => ({
      key: "",
      group: "lekse" as const,
      selected: true,
      text: h.text.trim(),
      // Utenfor uka (eller ugyldig) → hele uka, så leksa ikke havner under feil uke.
      date: isDateKey(h.due) && h.due >= weekStart && h.due <= weekEnd ? h.due : "",
      allDay: true,
      startTime: "",
      endTime: "",
      notes: "",
      kind: "hendelse" as const,
      duplicate: false,
      past: false,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const goals: PlanRow[] = ai.goals
    .filter((g) => g.trim())
    .map((g) => ({
      key: "",
      group: "mal" as const,
      selected: true,
      text: g.trim(),
      date: "",
      allDay: true,
      startTime: "",
      endTime: "",
      notes: "",
      kind: "hendelse" as const,
      duplicate: false,
      past: false,
    }));

  const rows = [...calendar, ...homework, ...goals].map((r, i) => ({ ...r, key: `${r.group}-${i}` }));
  return { personId, weekStart, weekGuessed, rows, explanation: ai.explanation };
}

// ---------------------------------------------------------------------
// Redigering i arket
// ---------------------------------------------------------------------

/**
 * Flytter en rad til en annen gruppe («Hvor?» i bunnarket) og tilpasser feltene:
 * kalender → lekse/mål beholder dagen hvis den er i uka; lekse → kalender får dagen (eller mandag) og heldag.
 */
export function moveRow(row: PlanRow, group: PlanGroup, weekStart: string): PlanRow {
  if (row.group === group) return row;
  const inWeek = (d: string) => isDateKey(d) && d >= weekStart && d <= addDays(weekStart, 6);
  if (group === "mal") return { ...row, group, date: "", duplicate: false, past: false };
  if (group === "lekse") return { ...row, group, date: inWeek(row.date) ? row.date : "", duplicate: false, past: false };
  const date = row.date || weekStart;
  return { ...row, group, date, allDay: true, startTime: "", endTime: "", duplicate: false, past: false };
}

/** Feilmelding for en valgt rad som ikke kan lagres, ellers null. */
export function rowError(row: PlanRow): string | null {
  if (!row.text.trim()) return "Skriv en tekst.";
  if (row.group === "kalender") {
    if (!isDateKey(row.date)) return "Velg en dato.";
    if (!row.allDay && !TIME_RE.test(row.startTime)) return "Velg et klokkeslett, eller huk av for «Hele dagen».";
  }
  if (row.group === "lekse" && row.date && !isDateKey(row.date)) return "Velg en gyldig dag.";
  return null;
}

/** Kalenderraden som utkast til `draftToRow` / `createEvents` (samme validering som ellers). */
export function rowToEventDraft(row: PlanRow, personId: string): EventDraft {
  return {
    title: row.text.trim(),
    category: PLAN_EVENT_CATEGORY,
    allDay: row.allDay,
    date: row.date,
    startTime: row.allDay ? "" : row.startTime,
    endDate: row.date,
    endTime: row.allDay ? "" : row.endTime,
    location: "",
    description: row.notes,
    personIds: personId ? [personId] : [],
  };
}

/** Antall valgte rader per gruppe — til knappen «Lagre: 3 i kalenderen, 8 lekser». */
export function selectedCounts(rows: PlanRow[]) {
  const sel = rows.filter((r) => r.selected);
  return {
    calendar: sel.filter((r) => r.group === "kalender").length,
    homework: sel.filter((r) => r.group === "lekse").length,
    goals: sel.filter((r) => r.group === "mal").length,
  };
}

export function saveLabel(rows: PlanRow[]): string {
  const c = selectedCounts(rows);
  const parts = [
    c.calendar > 0 && `${c.calendar} i kalenderen`,
    c.homework > 0 && `${c.homework} ${c.homework === 1 ? "lekse" : "lekser"}`,
    c.goals > 0 && `${c.goals} mål`,
  ].filter(Boolean);
  return parts.length > 0 ? `Lagre: ${parts.join(", ")}` : "Ingenting å lagre";
}
