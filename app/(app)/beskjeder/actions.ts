"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { messages, tasks } from "@/lib/db/schema";
import { notifyOthers } from "@/lib/push";
import { requireUser } from "@/lib/session";
import type { Message } from "@/lib/types";

type Result = { error?: string };

export async function sendMessage(body: string): Promise<Result & { message?: Message }> {
  const user = await requireUser();
  const parsed = z.string().trim().min(1).max(4000).safeParse(body);
  if (!parsed.success) return { error: "Skriv en beskjed først." };
  const [message] = await db.insert(messages).values({ body: parsed.data, created_by: user.id }).returning();
  const preview = parsed.data.length > 90 ? `${parsed.data.slice(0, 90)}…` : parsed.data;
  after(() => notifyOthers(user.id, `skrev: ${preview}`, "/beskjeder", "messages"));
  revalidatePath("/", "layout");
  return { message };
}

export async function setPinned(id: string, pinned: boolean): Promise<Result> {
  await requireUser();
  await db.update(messages).set({ pinned }).where(eq(messages.id, z.uuid().parse(id)));
  revalidatePath("/", "layout");
  return {};
}

/** Bare egne beskjeder kan slettes. */
export async function deleteMessage(id: string): Promise<Result> {
  const user = await requireUser();
  await db.delete(messages).where(and(eq(messages.id, z.uuid().parse(id)), eq(messages.created_by, user.id)));
  revalidatePath("/", "layout");
  return {};
}

/** Gjør en beskjed om til et felles gjøremål (første linje blir tittel, resten notat). */
export async function messageToTask(id: string): Promise<Result> {
  const user = await requireUser();
  const [message] = await db.select().from(messages).where(eq(messages.id, z.uuid().parse(id)));
  if (!message) return { error: "Fant ikke beskjeden." };
  const [first, ...rest] = message.body.split("\n");
  const title = first.length > 200 ? `${first.slice(0, 197)}…` : first;
  await db.insert(tasks).values({ title, notes: rest.join("\n").trim() || null, created_by: user.id });
  revalidatePath("/", "layout");
  return {};
}
