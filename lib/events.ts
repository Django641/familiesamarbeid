import type { CalendarEvent } from "@/lib/types";
import { addDays, osloDateKey, osloTime, osloToIso } from "@/lib/utils";

/** Siste dag (Oslo, inklusiv) en hendelse dekker. */
export function eventEndKey(e: Pick<CalendarEvent, "starts_at" | "ends_at" | "all_day">): string {
  const startKey = osloDateKey(e.starts_at);
  if (!e.ends_at) return startKey;
  if (e.all_day) return osloDateKey(e.ends_at);
  // Tidsbestemt hendelse som slutter nøyaktig ved midnatt hører til dagen før.
  const endKey = osloDateKey(new Date(new Date(e.ends_at).getTime() - 1));
  return endKey < startKey ? startKey : endKey;
}

export type AgendaEntry = {
  event: CalendarEvent;
  /** "14:00–15:30", "Hele dagen", "fra 14:00", "til 10:00" */
  timeLabel: string;
  sortKey: string;
};

export type AgendaDay = { dateKey: string; entries: AgendaEntry[] };

/**
 * Fordeler hendelser på dager i [fromKey, toKey]. Flerdagshendelser (reiser!)
 * vises på hver dag de dekker. Sortering: heldag først, så etter klokkeslett.
 */
export function buildAgenda(events: CalendarEvent[], fromKey: string, toKey: string): AgendaDay[] {
  const days = new Map<string, AgendaEntry[]>();

  for (const event of events) {
    const startKey = osloDateKey(event.starts_at);
    const endKey = eventEndKey(event);
    let key = startKey < fromKey ? fromKey : startKey;
    let guard = 0;
    while (key <= endKey && key <= toKey && guard < 92) {
      let timeLabel: string;
      let sortKey: string;
      if (event.all_day) {
        timeLabel = "Hele dagen";
        sortKey = "00:00a";
      } else if (startKey === endKey) {
        timeLabel = event.ends_at
          ? `${osloTime(event.starts_at)}–${osloTime(event.ends_at)}`
          : osloTime(event.starts_at);
        sortKey = osloTime(event.starts_at);
      } else if (key === startKey) {
        timeLabel = `fra ${osloTime(event.starts_at)}`;
        sortKey = osloTime(event.starts_at);
      } else if (key === endKey) {
        timeLabel = `til ${osloTime(event.ends_at!)}`;
        sortKey = "00:00b";
      } else {
        timeLabel = "Hele dagen";
        sortKey = "00:00a";
      }
      const list = days.get(key) ?? [];
      list.push({ event, timeLabel, sortKey });
      days.set(key, list);
      key = addDays(key, 1);
      guard++;
    }
  }

  return Array.from(days.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, entries]) => ({
      dateKey,
      entries: entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
    }));
}

/** ISO-grenser for en spørring som dekker dagene [fromKey, toKey] i Oslo. */
export function rangeBounds(fromKey: string, toKey: string) {
  return { startIso: osloToIso(fromKey), endIso: osloToIso(addDays(toKey, 1)) };
}
