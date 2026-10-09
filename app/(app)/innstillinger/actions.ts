"use server";

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PERSON_COLORS } from "@/lib/config";
import { db } from "@/lib/db";
import { account, people, push_subscriptions, session } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

type Result = { error?: string };
const Color = z.enum(PERSON_COLORS.map((c) => c.value) as [string, ...string[]]);

function done(): Result {
  revalidatePath("/", "layout");
  return {};
}

export async function updatePerson(
  id: string,
  input: { name?: string; color?: string; hints?: string }
): Promise<Result> {
  await requireUser();
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(40).optional(),
      color: Color.optional(),
      hints: z.string().trim().max(300).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Ugyldig endring." };
  await db.update(people).set(parsed.data).where(eq(people.id, z.uuid().parse(id)));
  return done();
}

export async function addChild(name: string): Promise<Result> {
  await requireUser();
  const parsed = z.string().trim().min(1).max(40).safeParse(name);
  if (!parsed.success) return { error: "Skriv et navn." };
  const all = await db.select().from(people);
  const used = new Set(all.map((p) => p.color));
  const color = PERSON_COLORS.find((c) => !used.has(c.value))?.value ?? PERSON_COLORS[all.length % PERSON_COLORS.length].value;
  await db.insert(people).values({ name: parsed.data, kind: "barn", color, position: 10 + all.length });
  return done();
}

/** Bare barn kan fjernes (voksne er koblet til en konto). */
export async function removeChild(id: string): Promise<Result> {
  await requireUser();
  await db.delete(people).where(and(eq(people.id, z.uuid().parse(id)), eq(people.kind, "barn")));
  return done();
}

const Subscription = z.object({
  endpoint: z.url().max(1000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(200),
});

export async function savePushSubscription(input: z.input<typeof Subscription>): Promise<Result> {
  const user = await requireUser();
  const parsed = Subscription.safeParse(input);
  if (!parsed.success) return { error: "Ugyldig abonnement." };
  await db
    .insert(push_subscriptions)
    .values({ ...parsed.data, user_id: user.id })
    .onConflictDoUpdate({ target: push_subscriptions.endpoint, set: { ...parsed.data, user_id: user.id } });
  return {};
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  const user = await requireUser();
  await db
    .delete(push_subscriptions)
    .where(and(eq(push_subscriptions.endpoint, endpoint), eq(push_subscriptions.user_id, user.id)));
  return {};
}

/**
 * «Glemt passord» uten e-post: den ene voksne kan sette nytt passord for den andre.
 * Den andre logges ut på alle enheter og må logge inn med det nye passordet.
 */
export async function setPartnerPassword(personId: string, newPassword: string): Promise<Result> {
  const user = await requireUser();
  const parsedPassword = z.string().min(8, "Passordet må være minst 8 tegn.").max(128).safeParse(newPassword);
  if (!parsedPassword.success) return { error: parsedPassword.error.issues[0]?.message };

  const [partner] = await db.select().from(people).where(eq(people.id, z.uuid().parse(personId)));
  if (!partner?.user_id || partner.kind !== "voksen" || partner.user_id === user.id) {
    return { error: "Kan bare endre passord for den andre voksne." };
  }
  const hash = await hashPassword(parsedPassword.data);
  const updated = await db
    .update(account)
    .set({ password: hash })
    .where(and(eq(account.userId, partner.user_id), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (updated.length === 0) return { error: "Fant ingen passordkonto." };
  await db.delete(session).where(eq(session.userId, partner.user_id));
  return {};
}
