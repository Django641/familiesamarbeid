import "server-only";

import ICAL from "ical.js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ExternalCalendar } from "@/lib/types";
import { osloToIso } from "@/lib/utils";

// Importerer abonnerte ICS-kalendere (f.eks. en Google-kalender som Spond synker
// til) inn i events-tabellen. Kjøres av /api/cron/sync-calendars og «Synk nå».
// Vindu: 30 dager bakover, 180 dager fremover. Gjentakende hendelser ekspanderes.

const PAST_DAYS = 30;
const FUTURE_DAYS = 180;
const MAX_OCCURRENCES = 1500;

type ParsedEvent = {
  external_uid: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
};

type ImportedRow = ParsedEvent & {
  household_id: string;
  external_calendar_id: string;
  source: "ics";
  category: string;
  person_ids: string[];
};

const MAX_BYTES = 5 * 1024 * 1024;

/** webcal:// → https:// (Google/iCloud gir ofte webcal-lenker). Bare https godtas. */
export function normalizeIcsUrl(raw: string): URL {
  const url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  if (url.protocol !== "https:") throw new Error("Lenken må starte med https:// eller webcal://");
  const host = url.hostname;
  if (host === "localhost" || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host) || host.includes(":")) {
    throw new Error("Lenken peker til en intern adresse");
  }
  return url;
}

/** Leser svaret med tak på størrelse, så en feil lenke ikke kan fylle minnet. */
async function readLimited(res: Response): Promise<string> {
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("Kalenderfila er for stor");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Kalenderfila er for stor");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function toParsed(
  uid: string,
  summary: string,
  description: string | null,
  location: string | null,
  start: ICAL.Time,
  end: ICAL.Time | null
): ParsedEvent {
  const allDay = start.isDate;
  let endsAt: string | null = null;
  if (end) {
    if (allDay) {
      // DTEND for heldag er eksklusiv; vi lagrer siste dag inklusiv.
      const last = end.clone();
      last.adjust(-1, 0, 0, 0);
      endsAt = last.compare(start) > 0 ? dateToIso(last) : null;
    } else {
      endsAt = end.toJSDate().toISOString();
    }
  }
  return {
    external_uid: uid,
    title: summary || "(uten tittel)",
    description,
    location,
    starts_at: allDay ? dateToIso(start) : start.toJSDate().toISOString(),
    ends_at: endsAt,
    all_day: allDay,
  };
}

/** Heldagsdato → midnatt Oslo som ISO (samme konvensjon som manuelle hendelser). */
function dateToIso(t: ICAL.Time): string {
  return osloToIso(`${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`);
}

export function parseIcs(
  text: string,
  cal: ExternalCalendar,
  now = new Date()
): { rows: ImportedRow[]; truncated: boolean } {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(tz);
  }

  const windowStart = ICAL.Time.fromJSDate(new Date(now.getTime() - PAST_DAYS * 86_400_000), true);
  const windowEnd = ICAL.Time.fromJSDate(new Date(now.getTime() + FUTURE_DAYS * 86_400_000), true);

  const vevents = root.getAllSubcomponents("vevent");
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    masters.get(ex.uid)?.relateException(ex);
  }

  const parsed: ParsedEvent[] = [];
  for (const ev of masters.values()) {
    if (!ev.startDate) continue;
    if (ev.isRecurring()) {
      const it = ev.iterator();
      let next: ICAL.Time | null;
      let guard = 0;
      while ((next = it.next()) && guard < 2000 && parsed.length < MAX_OCCURRENCES) {
        guard++;
        if (next.compare(windowEnd) > 0) break;
        const details = ev.getOccurrenceDetails(next);
        const endTime = details.endDate ?? details.startDate;
        if (endTime.compare(windowStart) < 0) continue;
        const item = details.item;
        parsed.push(
          toParsed(
            `${ev.uid}::${details.recurrenceId.toString()}`,
            item.summary,
            item.description || null,
            item.location || null,
            details.startDate,
            details.endDate
          )
        );
      }
    } else {
      const end = ev.endDate ?? null;
      if (ev.startDate.compare(windowEnd) > 0) continue;
      if ((end ?? ev.startDate).compare(windowStart) < 0) continue;
      parsed.push(
        toParsed(ev.uid, ev.summary, ev.description || null, ev.location || null, ev.startDate, end)
      );
    }
  }
  const rows = parsed.map((r) => ({
    ...r,
    source: "ics" as const,
    household_id: cal.household_id,
    external_calendar_id: cal.id,
    category: cal.category,
    person_ids: cal.person_ids,
  }));
  return { rows, truncated: parsed.length >= MAX_OCCURRENCES };
}

/** Henter med manuell redirect-håndtering, så hver ny adresse også sjekkes. */
async function fetchIcs(rawUrl: string): Promise<Response> {
  let url = normalizeIcsUrl(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "Familiesamarbeid/1.0 (privat familiekalender)" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = normalizeIcsUrl(new URL(location, url).toString());
      continue;
    }
    return res;
  }
  throw new Error("For mange videresendinger");
}

/** Synker én kalender: henter, parser, upserter og sletter forsvunne hendelser. */
export async function syncCalendar(cal: ExternalCalendar): Promise<{ ok: boolean; count: number; error?: string }> {
  const admin = createAdminClient();
  try {
    const res = await fetchIcs(cal.url);
    if (!res.ok) throw new Error(`Kalenderen svarte ${res.status}`);
    const text = await readLimited(res);
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Lenken ga ikke en iCal-fil");

    const { rows, truncated } = parseIcs(text, cal);
    // Dedup på UID (enkelte kilder gjentar samme forekomst).
    const unique = Array.from(new Map(rows.map((r) => [r.external_uid, r])).values());

    if (unique.length > 0) {
      const { error } = await admin
        .from("events")
        .upsert(unique, { onConflict: "external_calendar_id,external_uid" });
      if (error) throw new Error(error.message);
    }

    // Fjern importerte hendelser som ikke lenger finnes i kilden (innenfor vinduet).
    // Hopper over når parsingen ble avkortet — da vet vi ikke hva som mangler.
    const stale: string[] = [];
    if (!truncated) {
      const windowStartIso = new Date(Date.now() - PAST_DAYS * 86_400_000).toISOString();
      const keep = new Set(unique.map((r) => r.external_uid));
      for (let from = 0; ; from += 1000) {
        const { data: page } = await admin
          .from("events")
          .select("id, external_uid")
          .eq("external_calendar_id", cal.id)
          .gte("starts_at", windowStartIso)
          .order("id")
          .range(from, from + 999);
        for (const e of page ?? []) if (!keep.has(e.external_uid as string)) stale.push(e.id);
        if (!page || page.length < 1000) break;
      }
    }
    for (let i = 0; i < stale.length; i += 200) {
      await admin.from("events").delete().in("id", stale.slice(i, i + 200));
    }

    await admin
      .from("external_calendars")
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq("id", cal.id);
    return { ok: true, count: unique.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    await admin
      .from("external_calendars")
      .update({ last_synced_at: new Date().toISOString(), last_error: message.slice(0, 300) })
      .eq("id", cal.id);
    return { ok: false, count: 0, error: message };
  }
}
