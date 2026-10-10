import { EVENT_CATEGORIES } from "@/lib/config";
import { type EventDraft, REPEATS, type Repeat, defaultRepeatUntil } from "@/lib/event-draft";
import type { Person } from "@/lib/types";
import { osloDateKey } from "@/lib/utils";

/** Slik /api/ai/parse-events returnerer en hendelse. */
export type AiEvent = {
  title: string;
  date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  all_day: boolean;
  location: string;
  category: string;
  people: string[];
  notes: string;
  /** Mangler i eldre svar → "none". */
  repeat?: string;
};

export type Row = EventDraft & { key: string; selected: boolean; repeat: Repeat; repeatUntil: string };

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toRow(e: AiEvent, people: Person[], i: number): Row {
  const names = e.people.map((n) => n.toLowerCase());
  const allDay = e.all_day || !TIME_RE.test(e.start_time);
  return {
    key: `${i}-${e.title}`,
    selected: true,
    title: e.title,
    category: EVENT_CATEGORIES.some((c) => c.value === e.category) ? e.category : "annet",
    allDay,
    date: DATE_RE.test(e.date) ? e.date : "",
    startTime: allDay ? "" : e.start_time,
    endDate: DATE_RE.test(e.end_date) ? e.end_date : e.date,
    endTime: !allDay && TIME_RE.test(e.end_time) ? e.end_time : "",
    location: e.location,
    description: e.notes,
    personIds: people.filter((p) => names.includes(p.name.toLowerCase())).map((p) => p.id),
    repeat: REPEATS.find((r) => r === e.repeat) ?? "none",
    repeatUntil: defaultRepeatUntil(DATE_RE.test(e.date) ? e.date : osloDateKey(new Date())),
  };
}

/** Bilder og PDF-er kan tolkes (Finder kan gi tom MIME-type, så sjekk også filendelsen). */
export function isReadableFile(f: File) {
  return f.type.startsWith("image/") || f.type === "application/pdf" || /\.(pdf|heic|heif|jpe?g|png|webp)$/i.test(f.name);
}
