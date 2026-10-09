import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Household, Person } from "@/lib/types";

/**
 * Brukerens husstand + familiemedlemmer. Cachet per request med React.cache
 * så layout og side deler én spørring. Redirect til /onboarding hvis brukeren
 * ikke er med i noen husstand ennå.
 *
 * getSession() leser bare cookien (ingen nettverkskall) — proxy.ts har allerede
 * validert sesjonen, og RLS beskytter dataene uansett.
 */
export const getHousehold = cache(
  async (): Promise<{ household: Household; people: Person[]; userId: string; me: Person | null }> => {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) redirect("/login");
    const userId = session.user.id;

    const { data: membership } = await supabase
      .from("household_members")
      .select("household_id, households ( * )")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const household = membership?.households as unknown as Household | undefined;
    if (!household) redirect("/onboarding");

    const { data: people } = await supabase
      .from("people")
      .select("*")
      .eq("household_id", household.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    const list = (people ?? []) as Person[];
    return { household, people: list, userId, me: list.find((p) => p.user_id === userId) ?? null };
  }
);
