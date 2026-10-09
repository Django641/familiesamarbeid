// Bygger en iCalendar-fil (RFC 5545) for abonnement fra Outlook/Google/iPhone.

import { categoryMeta } from "@/lib/config";
import { eventEndKey } from "@/lib/events";
import type { CalendarEvent, Person } from "@/lib/types";
import { addDays, osloDateKey } from "@/lib/utils";

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Bretter linjer til maks 75 oktetter (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // fortsettelseslinjer starter med mellomrom
    if (currentBytes + size > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function dateValue(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}

export function buildIcs(opts: { name: string; events: CalendarEvent[]; people: Person[] }): string {
  const { name, events, people } = opts;
  const byId = new Map(people.map((p) => [p.id, p]));
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Familiesamarbeid//NO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Europe/Oslo",
    // Hint om oppdateringsfrekvens. Apple respekterer det; Google/Outlook bestemmer selv.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const e of events) {
    const names = e.person_ids.map((id) => byId.get(id)?.name).filter(Boolean) as string[];
    const everyone = people.length > 0 && names.length === people.length;
    const summary = names.length > 0 && !everyone ? `${names.join(" og ")}: ${e.title}` : e.title;
    const description = [
      categoryMeta(e.category).label,
      names.length > 0 ? `Gjelder: ${everyone ? "hele familien" : names.join(", ")}` : null,
      e.description,
    ]
      .filter(Boolean)
      .join("\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@familiesamarbeid`);
    lines.push(`DTSTAMP:${utcStamp(e.updated_at)}`);
    lines.push(`LAST-MODIFIED:${utcStamp(e.updated_at)}`);
    // Sekunder siden 2024 — øker ved hver endring og holder seg innenfor int32 i mange tiår.
    lines.push(`SEQUENCE:${Math.max(0, Math.floor((Date.parse(e.updated_at) - Date.UTC(2024, 0, 1)) / 1000))}`);
    if (e.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${dateValue(osloDateKey(e.starts_at))}`);
      lines.push(`DTEND;VALUE=DATE:${dateValue(addDays(eventEndKey(e), 1))}`);
      lines.push("TRANSP:TRANSPARENT");
    } else {
      const end = e.ends_at ?? new Date(Date.parse(e.starts_at) + 3_600_000).toISOString();
      lines.push(`DTSTART:${utcStamp(e.starts_at)}`);
      lines.push(`DTEND:${utcStamp(end)}`);
    }
    lines.push(`SUMMARY:${escapeText(summary)}`);
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    lines.push(`CATEGORIES:${escapeText(categoryMeta(e.category).label)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
