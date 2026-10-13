// Valideringen av én hendelsesrad. Delt av Server Actions i kalender og lekser
// (en "use server"-fil kan ikke eksportere skjemaer).

import { z } from "zod";

import { EVENT_CATEGORIES } from "@/lib/config";

export const EventRow = z
  .object({
    title: z.string().trim().min(1, "Skriv en tittel.").max(200, "Tittelen er for lang (maks 200 tegn)."),
    category: z.enum(EVENT_CATEGORIES.map((c) => c.value) as [string, ...string[]], "Ugyldig kategori."),
    all_day: z.boolean(),
    starts_at: z.iso.datetime("Ugyldig starttidspunkt."),
    ends_at: z.iso.datetime("Ugyldig sluttidspunkt.").nullable(),
    location: z.string().max(200, "Stedet er for langt (maks 200 tegn).").nullable(),
    description: z.string().max(4000, "Beskrivelsen er for lang.").nullable(),
    person_ids: z.array(z.uuid("Ugyldig person.")).max(20, "For mange personer."),
    series_id: z.uuid().optional(),
  })
  .refine((e) => !e.ends_at || e.ends_at >= e.starts_at, "Slutt må være etter start.");

export type EventRowInput = z.input<typeof EventRow>;

/** Radens tider som Date, klar for events-tabellen. */
export function eventRowToDb(e: z.output<typeof EventRow>) {
  return { ...e, starts_at: new Date(e.starts_at), ends_at: e.ends_at ? new Date(e.ends_at) : null };
}
