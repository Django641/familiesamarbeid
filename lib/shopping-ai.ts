import "server-only";

import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { isAiConfigured, structuredCall } from "@/lib/anthropic";
import { db } from "@/lib/db";
import { shopping_items } from "@/lib/db/schema";
import { STORE_ORDER } from "@/lib/store-order";

// AI-sortering av handlelista etter butikkrekkefølge (portert fra Hyttekompis).
// Modellen får og returnerer VARENUMRE (1-basert), ikke id-er, så den ikke kan
// finne på eller skrive feil id. Serveren mapper tilbake og er tolerant.

const SORT_SYSTEM = `Du sorterer en handleliste etter hvor varene sannsynligvis står i en typisk norsk dagligvarebutikk (Kiwi, Rema 1000, Coop, Meny), i den rekkefølgen man går gjennom butikken:

${STORE_ORDER}

Du får en nummerert liste med varer. Returner ALLE numrene nøyaktig én gang hver, i butikk-rekkefølge. Varer du er usikker på plasserer du der de mest sannsynlig hører hjemme — aldri utelat et nummer.`;

const PLACE_SYSTEM = `Du får en handleliste som allerede er sortert etter rekkefølgen man går gjennom en typisk norsk dagligvarebutikk (Kiwi, Rema 1000, Coop, Meny):

${STORE_ORDER}

Oppgaven: avgjør hvor én ny vare hører hjemme i lista. Svar med varenummeret den nye varen skal stå rett etter (0 = helt først).`;

const SORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ordered"],
  properties: {
    ordered: {
      type: "array",
      items: { type: "integer" },
      description: "Alle varenumrene fra listen, i den rekkefølgen man møter varene i butikken",
    },
  },
} as const;

const PLACE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["place_after"],
  properties: {
    place_after: {
      type: "integer",
      description: "Varenummeret den nye varen skal stå RETT ETTER. 0 betyr helt først i lista.",
    },
  },
} as const;

/** Sorterer alle dagligvarer og lagrer sort_order = 1..n. Returnerer feilmelding ved problemer. */
export async function sortGroceries(): Promise<{ error?: string }> {
  if (!isAiConfigured()) return { error: "AI er ikke satt opp ennå (ANTHROPIC_API_KEY mangler)." };
  const items = await db
    .select({ id: shopping_items.id, name: shopping_items.name })
    .from(shopping_items)
    .where(eq(shopping_items.category, "dagligvare"))
    .orderBy(asc(shopping_items.created_at));
  if (items.length < 2) return {};

  const raw = await structuredCall({
    system: SORT_SYSTEM,
    user: `Sorter denne handlelisten etter butikk-rekkefølge:\n\n${items.map((it, i) => `${i + 1}. ${it.name}`).join("\n")}`,
    schema: SORT_SCHEMA,
  });
  const parsed = z.object({ ordered: z.array(z.number().int()) }).safeParse(raw);
  if (!parsed.success) return { error: "AI-en klarte ikke å sortere lista. Prøv igjen." };

  const seen = new Set<number>();
  const orderedIds: string[] = [];
  for (const n of parsed.data.ordered) {
    const index = n - 1;
    if (index >= 0 && index < items.length && !seen.has(index)) {
      seen.add(index);
      orderedIds.push(items[index].id);
    }
  }
  items.forEach((it, i) => {
    if (!seen.has(i)) orderedIds.push(it.id);
  });

  await db.transaction(async (tx) => {
    // Lås synk-telleren FØRST (samme rekkefølge som trigger-oppdateringer fra andre
    // endringer), så vi ikke får deadlock med den andre telefonen.
    await tx.execute(sql`select 1 from sync_state where id = 1 for update`);
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(shopping_items).set({ sort_order: i + 1 }).where(eq(shopping_items.id, id));
    }
  });
  return {};
}

/**
 * Auto-innsortering: plasserer én ny dagligvare i en allerede sortert liste ved å
 * sette sort_order til midtpunktet mellom naboene. No-op hvis lista ikke er sortert.
 */
export async function placeGrocery(itemId: string): Promise<void> {
  if (!isAiConfigured()) return;
  const [item] = await db.select().from(shopping_items).where(eq(shopping_items.id, itemId));
  if (!item || item.category !== "dagligvare" || item.sort_order !== null) return;

  const sorted = await db
    .select({ id: shopping_items.id, name: shopping_items.name, sort_order: shopping_items.sort_order })
    .from(shopping_items)
    .where(
      and(eq(shopping_items.category, "dagligvare"), isNotNull(shopping_items.sort_order), ne(shopping_items.id, itemId))
    )
    .orderBy(asc(shopping_items.sort_order));
  if (sorted.length === 0) return;

  const raw = await structuredCall({
    system: PLACE_SYSTEM,
    user: `Sortert handleliste:\n\n${sorted.map((s, i) => `${i + 1}. ${s.name}`).join("\n")}\n\nNy vare: ${item.name}`,
    schema: PLACE_SCHEMA,
    maxTokens: 1000,
  });
  const parsed = z.object({ place_after: z.number().int() }).safeParse(raw);
  if (!parsed.success) return;

  const k = Math.max(0, Math.min(sorted.length, parsed.data.place_after));
  const orders = sorted.map((s) => s.sort_order as number);
  const newOrder =
    k === 0 ? orders[0] - 1 : k === sorted.length ? orders[orders.length - 1] + 1 : (orders[k - 1] + orders[k]) / 2;
  await db.update(shopping_items).set({ sort_order: newOrder }).where(eq(shopping_items.id, itemId));
}
