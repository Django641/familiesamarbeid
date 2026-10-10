"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { EVENT_CATEGORIES } from "@/lib/config";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { notifyOthers } from "@/lib/push";
import { requireUser } from "@/lib/session";

const EventRow = z
  .object({
    title: z.string().trim().min(1).max(200),
    category: z.enum(EVENT_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
    all_day: z.boolean(),
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime().nullable(),
    location: z.string().max(200).nullable(),
    description: z.string().max(4000).nullable(),
    person_ids: z.array(z.uuid()).max(20),
    series_id: z.uuid().optional(),
  })
  .refine((e) => !e.ends_at || e.ends_at >= e.starts_at, "Slutt må være etter start.");

export type EventRowInput = z.input<typeof EventRow>;
type Result = { error?: string };

function toDb(e: z.output<typeof EventRow>) {
  return { ...e, starts_at: new Date(e.starts_at), ends_at: e.ends_at ? new Date(e.ends_at) : null };
}

export async function createEvents(rows: EventRowInput[]): Promise<Result> {
  const user = await requireUser();
  // Flere AI-forslag kan hver være en serie (maks 60 ganger hver).
  const parsed = z
    .array(EventRow)
    .min(1)
    .max(300, "For mange hendelser på én gang. Del opp, eller velg en tidligere «til og med».")
    .safeParse(rows);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ugyldig hendelse." };

  await db.insert(events).values(parsed.data.map((e) => ({ ...toDb(e), created_by: user.id })));

  const first = parsed.data[0];
  const message =
    parsed.data.length === 1 || first.series_id
      ? `la inn «${first.title}» i kalenderen`
      : `la inn ${parsed.data.length} hendelser i kalenderen`;
  after(() => notifyOthers(user.id, message, "/kalender", "calendar"));
  revalidatePath("/", "layout");
  return {};
}

/** Lagrer endringer. `repeats` = senere ganger når en enkelthendelse gjøres om til en serie. */
export async function updateEvent(id: string, row: EventRowInput, repeats: EventRowInput[] = []): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ row: EventRow, repeats: z.array(EventRow).max(59, "For mange ganger i serien.") }).safeParse({ row, repeats });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ugyldig hendelse." };
  const eventId = z.uuid().parse(id);
  const ok = await db.transaction(async (tx) => {
    const toSeries = parsed.data.repeats.length > 0;
    const updated = await tx
      .update(events)
      .set(toDb(parsed.data.row))
      // Den andre kan ha gjort den om til serie fra sin telefon i mellomtiden → ikke lag en serie til.
      .where(toSeries ? and(eq(events.id, eventId), isNull(events.series_id)) : eq(events.id, eventId))
      .returning({ id: events.id });
    if (!toSeries) return true;
    // Slettet eller alt en serie → ikke lag kopier.
    if (updated.length === 0) return false;
    await tx.insert(events).values(parsed.data.repeats.map((e) => ({ ...toDb(e), created_by: user.id })));
    return true;
  });
  if (!ok) return { error: "Hendelsen er endret på den andre telefonen. Gå tilbake og prøv igjen." };
  revalidatePath("/", "layout");
  return {};
}

export async function deleteEvent(id: string, wholeSeries: boolean): Promise<Result> {
  await requireUser();
  const [event] = await db.select().from(events).where(eq(events.id, z.uuid().parse(id)));
  if (!event) return {};
  if (wholeSeries && event.series_id) await db.delete(events).where(eq(events.series_id, event.series_id));
  else await db.delete(events).where(eq(events.id, event.id));
  revalidatePath("/", "layout");
  return {};
}
