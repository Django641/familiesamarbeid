"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { people, tasks } from "@/lib/db/schema";
import { notifyOthers } from "@/lib/push";
import { requireUser } from "@/lib/session";
import type { Task } from "@/lib/types";

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TaskInput = z.object({
  title: z.string().trim().min(1, "Skriv hva som skal gjøres.").max(200),
  notes: z.string().trim().max(2000).nullable().optional(),
  assignee_person_id: z.uuid().nullable(),
  due_date: DateKey.nullable(),
});
type Result = { error?: string };

function done(): Result {
  revalidatePath("/", "layout");
  return {};
}

export async function addTask(input: z.input<typeof TaskInput>): Promise<Result & { id?: string }> {
  const user = await requireUser();
  const parsed = TaskInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [row] = await db
    .insert(tasks)
    .values({ ...parsed.data, notes: parsed.data.notes || null, created_by: user.id })
    .returning({ id: tasks.id });

  // Varsle bare når oppgaven er gitt til noen andre enn meg selv, eller er felles.
  const assignee = parsed.data.assignee_person_id
    ? (await db.select().from(people).where(eq(people.id, parsed.data.assignee_person_id)))[0]
    : null;
  if (!assignee || assignee.user_id !== user.id) {
    const who = assignee ? (assignee.kind === "voksen" ? " til deg" : ` til ${assignee.name}`) : "";
    after(() => notifyOthers(user.id, `la til gjøremålet «${parsed.data.title}»${who}`, "/gjoremal", "tasks"));
  }
  revalidatePath("/", "layout");
  return { id: row.id };
}

export async function updateTask(id: string, input: z.input<typeof TaskInput>): Promise<Result> {
  await requireUser();
  const parsed = TaskInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await db
    .update(tasks)
    .set({ ...parsed.data, notes: parsed.data.notes || null })
    .where(eq(tasks.id, z.uuid().parse(id)));
  return done();
}

export async function setTaskDone(id: string, isDone: boolean): Promise<Result> {
  await requireUser();
  await db
    .update(tasks)
    .set({ done: isDone, done_at: isDone ? new Date() : null })
    .where(eq(tasks.id, z.uuid().parse(id)));
  return done();
}

export async function deleteTask(id: string): Promise<Result> {
  await requireUser();
  await db.delete(tasks).where(eq(tasks.id, z.uuid().parse(id)));
  return done();
}

export async function clearDoneTasks(): Promise<Result & { removed?: Task[] }> {
  await requireUser();
  const removed = await db.delete(tasks).where(eq(tasks.done, true)).returning();
  revalidatePath("/", "layout");
  return { removed };
}

export async function restoreTasks(rows: Task[]): Promise<Result> {
  await requireUser();
  z.array(z.uuid()).max(500).parse(rows.map((r) => r.id));
  if (rows.length === 0) return {};
  await db
    .insert(tasks)
    .values(
      rows.map((r) => ({
        ...r,
        done_at: r.done_at ? new Date(r.done_at) : null,
        created_at: new Date(r.created_at),
        updated_at: new Date(),
      }))
    )
    .onConflictDoNothing();
  return done();
}
