import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import { TIME_ZONE } from "@/lib/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------
// Dato/tid — alt vises i Europe/Oslo, uansett hvor telefonen er (jobbreiser).
// ---------------------------------------------------------------------

/** "YYYY-MM-DD" for et tidspunkt, sett fra Oslo. */
export function osloDateKey(date: Date | string): string {
  return new Date(date).toLocaleDateString("sv-SE", { timeZone: TIME_ZONE });
}

/** "HH:MM" (24 t, kolon) i Oslo-tid — samme format som <input type="time">. */
export function osloTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** Minutter Oslo ligger foran UTC på et gitt tidspunkt (60 vinter, 120 sommer). */
function osloOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Oslo-lokal dato ("YYYY-MM-DD") + klokkeslett ("HH:MM") → ISO-streng i UTC. */
export function osloToIso(date: string, time = "00:00"): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm);
  // To runder håndterer sommertid-overgangene korrekt.
  let ts = naiveUtc - osloOffsetMinutes(new Date(naiveUtc)) * 60000;
  ts = naiveUtc - osloOffsetMinutes(new Date(ts)) * 60000;
  return new Date(ts).toISOString();
}

/** Legger til n dager på en "YYYY-MM-DD"-nøkkel. */
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** "I dag", "I morgen", "Tirsdag 14. okt." for en dato-nøkkel. */
export function dayLabel(dateKey: string, todayKey = osloDateKey(new Date())): string {
  if (dateKey === todayKey) return "I dag";
  if (dateKey === addDays(todayKey, 1)) return "I morgen";
  if (dateKey === addDays(todayKey, -1)) return "I går";
  const label = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
