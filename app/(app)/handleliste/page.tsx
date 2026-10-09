import { TopBar } from "@/components/top-bar";
import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { ShoppingItem } from "@/lib/types";

import { NewShoppingItem } from "./new-shopping-item";
import { ShoppingList } from "./shopping-list";

export const metadata = { title: "Handleliste" };

// Portert fra Hyttekompis — se docs/HANDLELISTE.md der for full spesifikasjon.
export default async function ShoppingPage() {
  const [{ household }, supabase] = await Promise.all([getHousehold(), createClient()]);
  const { data } = await supabase
    .from("shopping_items")
    .select("*")
    .eq("household_id", household.id)
    .order("status", { ascending: false }) // ma_kjopes før kjopt
    .order("created_at", { ascending: false });

  return (
    <>
      <TopBar title="Handleliste" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <NewShoppingItem householdId={household.id} />
        <ShoppingList items={(data ?? []) as ShoppingItem[]} />
      </main>
    </>
  );
}
