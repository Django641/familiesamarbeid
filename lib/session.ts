import "server-only";

import { asc } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { people } from "@/lib/db/schema";
import type { Person } from "@/lib/types";

/** Sesjonen for denne requesten (cachet). Leses fra cookie-cache — som regel uten databasekall. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Innlogget bruker, eller redirect til /login. Brukes i sider og server actions. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

/**
 * Familien: alle personer + den innloggede brukerens egen person.
 * Har brukeren ikke fått en person ennå (første innlogging), sendes hen til /onboarding.
 */
export const getFamily = cache(async (): Promise<{ userId: string; people: Person[]; me: Person }> => {
  const user = await requireUser();
  const list = await db.select().from(people).orderBy(asc(people.position), asc(people.created_at));
  const me = list.find((p) => p.user_id === user.id);
  if (!me) redirect("/onboarding");
  return { userId: user.id, people: list, me };
});
