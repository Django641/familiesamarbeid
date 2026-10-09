"use server";

import { eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { shopping_items } from "@/lib/db/schema";
import { notifyOthers } from "@/lib/push";
import { requireUser } from "@/lib/session";
import { placeGrocery, sortGroceries } from "@/lib/shopping-ai";
import type { ShoppingItem } from "@/lib/types";

type Result = { error?: string };

const ItemInput = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(["dagligvare", "annet"]),
  store: z.string().trim().max(60).optional(),
});

function done(): Result {
  revalidatePath("/", "layout");
  return {};
}

export async function addShoppingItem(input: z.input<typeof ItemInput>): Promise<Result> {
  const user = await requireUser();
  const parsed = ItemInput.safeParse(input);
  if (!parsed.success) return { error: "Skriv inn en vare." };
  const { name, category, store } = parsed.data;

  const [row] = await db
    .insert(shopping_items)
    .values({ name, category, store: category === "annet" ? store || null : null, created_by: user.id })
    .returning({ id: shopping_items.id });

  after(async () => {
    await Promise.all([
      notifyOthers(user.id, `la til «${name}» på handlelista`, "/handleliste", "shopping"),
      category === "dagligvare" ? placeGrocery(row.id) : Promise.resolve(),
    ]);
  });
  return done();
}

export async function setShoppingStatus(id: string, status: "ma_kjopes" | "kjopt"): Promise<Result> {
  await requireUser();
  await db.update(shopping_items).set({ status }).where(eq(shopping_items.id, z.uuid().parse(id)));
  return done();
}

export async function updateShoppingItem(id: string, input: z.input<typeof ItemInput>): Promise<Result> {
  await requireUser();
  const parsed = ItemInput.safeParse(input);
  if (!parsed.success) return { error: "Ugyldig vare." };
  const { name, category, store } = parsed.data;
  await db
    .update(shopping_items)
    .set({ name, category, store: category === "annet" ? store || null : null })
    .where(eq(shopping_items.id, z.uuid().parse(id)));
  return done();
}

export async function deleteShoppingItem(id: string): Promise<Result> {
  await requireUser();
  await db.delete(shopping_items).where(eq(shopping_items.id, z.uuid().parse(id)));
  return done();
}

/** Fjerner alt som er kjøpt. Returnerer radene så klienten kan tilby «Angre». */
export async function clearBought(): Promise<Result & { removed?: ShoppingItem[] }> {
  await requireUser();
  const removed = await db.delete(shopping_items).where(ne(shopping_items.status, "ma_kjopes")).returning();
  revalidatePath("/", "layout");
  return { removed };
}

const RestoreRow = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  category: z.enum(["dagligvare", "annet"]),
  store: z.string().max(60).nullable(),
  status: z.enum(["ma_kjopes", "kjopt"]),
  sort_order: z.number().nullable(),
  created_by: z.string().max(100).nullable(),
  created_at: z.coerce.date(),
});

/** Angre: legger tilbake rader med samme id-er og felter (validert — kommer fra klienten). */
export async function restoreShoppingItems(items: ShoppingItem[]): Promise<Result> {
  await requireUser();
  const parsed = z.array(RestoreRow).max(500).safeParse(items);
  if (!parsed.success) return { error: "Kunne ikke angre." };
  if (parsed.data.length === 0) return {};
  await db.insert(shopping_items).values(parsed.data).onConflictDoNothing();
  return done();
}

export async function sortShoppingList(): Promise<Result> {
  await requireUser();
  try {
    const result = await sortGroceries();
    if (result.error) return result;
  } catch (error) {
    return { error: `AI-feil: ${error instanceof Error ? error.message : "ukjent"}` };
  }
  return done();
}

