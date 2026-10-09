"use server";

import { del, head } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DOCUMENT_CATEGORIES } from "@/lib/config";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

const Category = z.enum(DOCUMENT_CATEGORIES.map((c) => c.value) as [string, ...string[]]);
type Result = { error?: string };

/** Registrerer en fil som nettopp er lastet opp direkte til Blob (se /api/filer/upload). */
export async function registerDocument(input: { pathname: string; name: string; category: string }): Promise<Result> {
  const user = await requireUser();
  const parsed = z
    .object({
      pathname: z.string().regex(/^dokumenter\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,120}$/),
      name: z.string().trim().min(1).max(200),
      category: Category,
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Ugyldig fil." };

  // Stoler ikke på klienten for størrelse/type — spør Blob.
  const meta = await head(parsed.data.pathname).catch(() => null);
  if (!meta) return { error: "Fant ikke den opplastede filen." };

  await db
    .insert(documents)
    .values({
      name: parsed.data.name,
      pathname: parsed.data.pathname,
      content_type: meta.contentType,
      size_bytes: meta.size,
      category: parsed.data.category,
      created_by: user.id,
    })
    .onConflictDoNothing();
  revalidatePath("/", "layout");
  return {};
}

export async function updateDocument(id: string, input: { name?: string; category?: string }): Promise<Result> {
  await requireUser();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(200).optional(), category: Category.optional() })
    .safeParse(input);
  if (!parsed.success) return { error: "Ugyldig endring." };
  await db.update(documents).set(parsed.data).where(eq(documents.id, z.uuid().parse(id)));
  revalidatePath("/", "layout");
  return {};
}

export async function deleteDocument(id: string): Promise<Result> {
  await requireUser();
  const [doc] = await db.delete(documents).where(eq(documents.id, z.uuid().parse(id))).returning();
  if (doc) await del(doc.pathname).catch(() => {});
  revalidatePath("/", "layout");
  return {};
}
