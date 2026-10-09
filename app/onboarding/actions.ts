"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PERSON_COLORS } from "@/lib/config";
import { db } from "@/lib/db";
import { people, user as userTable } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

const Schema = z.object({
  name: z.string().trim().min(1, "Skriv navnet ditt.").max(40),
  children: z.array(z.string().trim().max(40)).max(8),
});

export type OnboardingState = { error?: string };

/** Første innlogging: lag personen for brukeren, og eventuelt barna (bare hvis ingen finnes ennå). */
export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await requireUser();
  const parsed = Schema.safeParse({
    name: formData.get("name"),
    children: formData.getAll("child").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ugyldig input" };

  const existing = await db.select().from(people);
  if (existing.some((p) => p.user_id === user.id)) redirect("/hjem");

  const adults = existing.filter((p) => p.kind === "voksen").length;
  const used = new Set(existing.map((p) => p.color));
  const nextColor = () => {
    const c = PERSON_COLORS.find((x) => !used.has(x.value))?.value ?? PERSON_COLORS[0].value;
    used.add(c);
    return c;
  };

  await db.transaction(async (tx) => {
    await tx.insert(people).values({
      name: parsed.data.name,
      kind: "voksen",
      color: nextColor(),
      user_id: user.id,
      position: adults,
    });
    await tx.update(userTable).set({ name: parsed.data.name }).where(eq(userTable.id, user.id));

    const [{ value: childCount }] = await tx.select({ value: count() }).from(people).where(eq(people.kind, "barn"));
    if (childCount === 0) {
      const kids = parsed.data.children.filter(Boolean);
      if (kids.length > 0) {
        await tx.insert(people).values(
          kids.map((name, i) => ({ name, kind: "barn" as const, color: nextColor(), position: 10 + i }))
        );
      }
    }
  });

  revalidatePath("/", "layout");
  redirect("/hjem");
}
