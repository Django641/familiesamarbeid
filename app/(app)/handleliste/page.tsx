import { desc } from "drizzle-orm";

import { TopBar } from "@/components/top-bar";
import { db } from "@/lib/db";
import { shopping_items } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

import { NewShoppingItem } from "./new-shopping-item";
import { ShoppingList } from "./shopping-list";

export const metadata = { title: "Handleliste" };

// Portert fra Hyttekompis — se docs/HANDLELISTE.md der for full spesifikasjon.
export default async function ShoppingPage() {
  await requireUser();
  const items = await db.select().from(shopping_items).orderBy(desc(shopping_items.status), desc(shopping_items.created_at));

  return (
    <>
      <TopBar title="Handleliste" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <NewShoppingItem />
        <ShoppingList items={items} />
      </main>
    </>
  );
}
