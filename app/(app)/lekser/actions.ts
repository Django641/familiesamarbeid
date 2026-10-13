"use server";

import { del, head } from "@vercel/blob";
import { and, count, eq, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { documents, events, homework_items, homework_weeks, people } from "@/lib/db/schema";
import { EventRow, eventRowToDb } from "@/lib/event-schema";
import { carryOverDone, planDocumentName, weekdayIndex } from "@/lib/homework";
import { notifyOthers } from "@/lib/push";
import { requireUser } from "@/lib/session";
import { addDays } from "@/lib/utils";
import { isoWeek } from "@/lib/week-layout";
import { isDateKey, normalizeTitle } from "@/lib/weekly-plan-draft";

type Result = { error?: string };

const DateKey = z.string().refine(isDateKey, "Ugyldig dato.");
const WeekStart = DateKey.refine((d) => weekdayIndex(d) === 1, "Uka må starte på en mandag.");
const Text = z.string().trim().min(1, "Skriv hva som skal gjøres.").max(300, "Teksten er for lang.");
const Kind = z.enum(["lekse", "mal"]);

/** Dagen må ligge i uka (mandag–søndag). */
function inWeek(weekStart: string, due: string | null): boolean {
  return due === null || (due >= weekStart && due <= addDays(weekStart, 6));
}

function done(): Result {
  revalidatePath("/", "layout");
  return {};
}

const ItemInput = z.object({
  text: Text,
  kind: Kind,
  due_date: DateKey.nullable(),
});

/** Finner (eller lager) uka for et barn. Kalles inni en transaksjon eller direkte. */
async function upsertWeek(tx: Pick<typeof db, "insert">, personId: string, weekStart: string, userId: string) {
  const [week] = await tx
    .insert(homework_weeks)
    .values({ person_id: personId, week_start: weekStart, created_by: userId })
    .onConflictDoUpdate({
      target: [homework_weeks.person_id, homework_weeks.week_start],
      set: { updated_at: new Date() },
    })
    .returning();
  return week;
}

// ---------------------------------------------------------------------
// Enkeltelementer
// ---------------------------------------------------------------------

const AddInput = ItemInput.extend({
  id: z.uuid().optional(),
  person_id: z.uuid(),
  week_start: WeekStart,
  source: z.enum(["ukeplan", "manuell"]).default("manuell"),
  done: z.boolean().default(false),
  position: z.number().int().min(0).max(100000).optional(),
});

export async function addHomeworkItem(input: z.input<typeof AddInput>): Promise<Result> {
  const user = await requireUser();
  const parsed = AddInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ugyldig lekse." };
  const v = parsed.data;
  if (!inWeek(v.week_start, v.due_date)) return { error: "Dagen må ligge i uka." };

  const [child] = await db.select({ id: people.id }).from(people).where(and(eq(people.id, v.person_id), eq(people.kind, "barn")));
  if (!child) return { error: "Fant ikke barnet." };

  await db.transaction(async (tx) => {
    const week = await upsertWeek(tx, v.person_id, v.week_start, user.id);
    const [{ top }] = await tx.select({ top: max(homework_items.position) }).from(homework_items).where(eq(homework_items.week_id, week.id));
    await tx
      .insert(homework_items)
      .values({
        ...(v.id ? { id: v.id } : {}),
        week_id: week.id,
        kind: v.kind,
        due_date: v.kind === "mal" ? null : v.due_date,
        text: v.text,
        source: v.source,
        done: v.kind === "lekse" && v.done,
        done_at: v.kind === "lekse" && v.done ? new Date() : null,
        position: v.position ?? (top ?? -1) + 1,
        created_by: user.id,
      })
      .onConflictDoNothing();
  });
  return done();
}

/** Angre sletting: samme som å legge til, med de gamle verdiene og samme id. */
export async function restoreHomeworkItem(input: z.input<typeof AddInput>): Promise<Result> {
  return addHomeworkItem(input);
}

export async function updateHomeworkItem(id: string, input: z.input<typeof ItemInput>): Promise<Result> {
  await requireUser();
  const parsed = ItemInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ugyldig lekse." };
  const v = parsed.data;
  const itemId = z.uuid().parse(id);

  const [row] = await db
    .select({ week_start: homework_weeks.week_start })
    .from(homework_items)
    .innerJoin(homework_weeks, eq(homework_weeks.id, homework_items.week_id))
    .where(eq(homework_items.id, itemId));
  if (!row) return { error: "Leksa finnes ikke lenger." };
  if (!inWeek(row.week_start, v.due_date)) return { error: "Dagen må ligge i uka." };

  await db
    .update(homework_items)
    .set({
      text: v.text,
      kind: v.kind,
      due_date: v.kind === "mal" ? null : v.due_date,
      // Mål har ingen avkrysning.
      ...(v.kind === "mal" ? { done: false, done_at: null } : {}),
    })
    .where(eq(homework_items.id, itemId));
  return done();
}

export async function setHomeworkDone(id: string, isDone: boolean): Promise<Result> {
  await requireUser();
  await db
    .update(homework_items)
    .set({ done: isDone, done_at: isDone ? new Date() : null })
    .where(and(eq(homework_items.id, z.uuid().parse(id)), eq(homework_items.kind, "lekse")));
  return done();
}

export async function deleteHomeworkItem(id: string): Promise<Result> {
  await requireUser();
  await db.delete(homework_items).where(eq(homework_items.id, z.uuid().parse(id)));
  return done();
}

// ---------------------------------------------------------------------
// Ukeplan fra skolen: lagre alt som er godkjent i én transaksjon
// ---------------------------------------------------------------------

/** Samme sti-regel som registerDocument (Dokumenter): lastet opp direkte til Blob under dokumenter/. */
const BlobPath = z.string().regex(/^dokumenter\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,120}$/);

const SavePlanInput = z.object({
  person_id: z.uuid(),
  week_start: WeekStart,
  /** Uka har alt en ukeplan: klienten har spurt «Erstatt?» og fått ja. */
  replace: z.boolean(),
  /** Legg til i uka (uten å erstatte eller spørre): samme uke for samme barn er alt lagret i denne økta. */
  append: z.boolean().default(false),
  items: z.array(ItemInput).max(120, "For mange lekser på én gang."),
  events: z.array(EventRow).max(60, "For mange hendelser på én gang."),
  files: z.array(BlobPath).max(8),
});

export async function saveWeeklyPlan(
  input: z.input<typeof SavePlanInput>
): Promise<Result & { needsConfirm?: boolean }> {
  const user = await requireUser();
  const parsed = SavePlanInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ugyldig ukeplan." };
  const v = parsed.data;
  if (v.items.some((i) => !inWeek(v.week_start, i.due_date))) return { error: "En lekse har en dag utenfor uka." };

  const [child] = await db.select().from(people).where(and(eq(people.id, v.person_id), eq(people.kind, "barn")));
  if (!child) return { error: "Fant ikke barnet." };

  // Stoler ikke på klienten for størrelse/type — spør Blob (som registerDocument).
  let headFailures = 0;
  const metas = await Promise.all(
    v.files.map((p) =>
      head(p).catch((e) => {
        headFailures += 1;
        console.error("saveWeeklyPlan: Blob head feilet", JSON.stringify({ files: v.files.length, error: e instanceof Error ? e.name : "ukjent" }));
        return null;
      })
    )
  );
  if (headFailures > 0 || metas.some((m) => !m)) return { error: "Fant ikke den opplastede originalen. Prøv å laste opp på nytt." };

  const weekFilter = and(eq(homework_weeks.person_id, v.person_id), eq(homework_weeks.week_start, v.week_start));
  const replacing = v.replace && !v.append;

  const result = await db.transaction(async (tx) => {
    let old: (typeof homework_items.$inferSelect)[] = [];
    if (replacing) {
      // Første skrivende setning i transaksjonen (samme rekkefølge som andre skrivere → ingen deadlock).
      old = await tx
        .delete(homework_items)
        .where(
          and(
            eq(homework_items.source, "ukeplan"),
            inArray(homework_items.week_id, tx.select({ id: homework_weeks.id }).from(homework_weeks).where(weekFilter))
          )
        )
        .returning();
    } else if (!v.append) {
      const [existing] = await tx
        .select({ id: homework_items.id })
        .from(homework_items)
        .innerJoin(homework_weeks, eq(homework_weeks.id, homework_items.week_id))
        .where(and(weekFilter, eq(homework_items.source, "ukeplan")))
        .limit(1);
      if (existing) return { needsConfirm: true as const };
    }

    const week = await upsertWeek(tx, v.person_id, v.week_start, user.id);

    let items = v.items;
    if (v.append) {
      // Legg til: hopp over det som alt står i uka.
      const have = await tx.select({ kind: homework_items.kind, text: homework_items.text }).from(homework_items).where(eq(homework_items.week_id, week.id));
      const key = (i: { kind: string; text: string }) => `${i.kind}|${i.text.trim().toLocaleLowerCase("nb-NO")}`;
      const seen = new Set(have.map(key));
      items = v.items.filter((i) => !seen.has(key(i)));
    }

    if (items.length > 0) {
      const [{ top }] = await tx.select({ top: max(homework_items.position) }).from(homework_items).where(eq(homework_items.week_id, week.id));
      const start = (top ?? -1) + 1;
      const carried = carryOverDone(old, items);
      await tx.insert(homework_items).values(
        items.map((item, i) => ({
          week_id: week.id,
          kind: item.kind,
          due_date: item.kind === "mal" ? null : item.due_date,
          text: item.text,
          source: "ukeplan" as const,
          done: carried[i].done,
          done_at: carried[i].done_at,
          position: start + i,
          created_by: user.id,
        }))
      );
    }

    let newEvents = v.events;
    if (v.append && newEvents.length > 0) {
      // Legg til: et tidligere ark i samme opplasting kan ha lagret samme hendelse (f.eks. «🩳 Gymtøy» torsdag).
      const existing = await tx
        .select({ title: events.title, starts_at: events.starts_at, person_ids: events.person_ids })
        .from(events)
        .where(inArray(events.starts_at, newEvents.map((e) => new Date(e.starts_at))));
      newEvents = newEvents.filter(
        (e) =>
          !existing.some(
            (x) =>
              x.starts_at.getTime() === new Date(e.starts_at).getTime() &&
              normalizeTitle(x.title) === normalizeTitle(e.title) &&
              e.person_ids.some((p) => x.person_ids.includes(p))
          )
      );
    }
    if (newEvents.length > 0) {
      await tx.insert(events).values(newEvents.map((e) => ({ ...eventRowToDb(e), created_by: user.id })));
    }

    if (v.files.length > 0) {
      // Unike navn også ved «Erstatt» eller flere opplastinger i samme uke: nummerer videre fra det som finnes.
      const [{ n }] = await tx.select({ n: count() }).from(documents).where(eq(documents.homework_week_id, week.id));
      await tx
        .insert(documents)
        .values(
          v.files.map((pathname, i) => ({
            name: planDocumentName(child.name, v.week_start, n + i),
            pathname,
            content_type: metas[i]!.contentType,
            size_bytes: metas[i]!.size,
            category: "skole",
            homework_week_id: week.id,
            created_by: user.id,
          }))
        )
        .onConflictDoNothing();
    }
    return { needsConfirm: false as const };
  });

  if (result.needsConfirm) return { needsConfirm: true };

  const message = `la inn ukeplan for ${child.name}, uke ${isoWeek(v.week_start)}`;
  const url = `/lekser?uke=${v.week_start}&barn=${child.id}`;
  after(() => notifyOthers(user.id, message, url, "homework"));
  return done();
}

/** Avbryt: originalene som er lastet opp til Blob, men aldri registrert, slettes igjen. */
export async function discardPlanUploads(pathnames: string[]): Promise<Result> {
  await requireUser();
  const parsed = z.array(BlobPath).max(8).safeParse(pathnames);
  if (!parsed.success || parsed.data.length === 0) return {};
  // Aldri slett filer som alt er registrert som dokumenter.
  const registered = await db.select({ pathname: documents.pathname }).from(documents).where(inArray(documents.pathname, parsed.data));
  const taken = new Set(registered.map((r) => r.pathname));
  let failed = 0;
  await Promise.all(
    parsed.data
      .filter((p) => !taken.has(p))
      .map((p) =>
        del(p).catch((e) => {
          failed += 1;
          console.error("discardPlanUploads: Blob del feilet", JSON.stringify({ error: e instanceof Error ? e.name : "ukjent" }));
        })
      )
  );
  if (failed > 0) console.error("discardPlanUploads", JSON.stringify({ files: parsed.data.length, failed }));
  return {};
}
