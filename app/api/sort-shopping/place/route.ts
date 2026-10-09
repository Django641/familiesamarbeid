import { NextResponse } from "next/server";
import { z } from "zod";

import { isAiConfigured, structuredCall } from "@/lib/anthropic";
import { STORE_ORDER } from "@/lib/store-order";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Auto-innsortering: plasserer én ny dagligvare i en allerede AI-sortert liste
// (midtpunkt mellom naboene i sort_order). Fire-and-forget fra klienten; alle
// feil gir { placed: false } med 200. Bruker brukerens egen klient (RLS gjelder).

const RequestSchema = z.object({ itemId: z.uuid() });
const AiResponseSchema = z.object({ place_after: z.number().int() });

const OUTPUT_SCHEMA = {
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

const SYSTEM = `Du får en handleliste som allerede er sortert etter rekkefølgen man går gjennom en typisk norsk dagligvarebutikk (Kiwi, Rema 1000, Coop, Meny):

${STORE_ORDER}

Oppgaven: avgjør hvor én ny vare hører hjemme i lista. Svar med varenummeret den nye varen skal stå rett etter (0 = helt først).`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
  if (!isAiConfigured()) return NextResponse.json({ placed: false });

  const parsedBody = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: "Ugyldig forespørsel" }, { status: 400 });

  const { data: item } = await supabase
    .from("shopping_items")
    .select("id, household_id, name, category, sort_order")
    .eq("id", parsedBody.data.itemId)
    .maybeSingle();
  if (!item || item.category !== "dagligvare" || item.sort_order !== null) {
    return NextResponse.json({ placed: false });
  }

  const { data: sorted } = await supabase
    .from("shopping_items")
    .select("id, name, sort_order")
    .eq("household_id", item.household_id)
    .eq("category", "dagligvare")
    .not("sort_order", "is", null)
    .neq("id", item.id)
    .order("sort_order", { ascending: true });
  if (!sorted || sorted.length === 0) return NextResponse.json({ placed: false });

  try {
    const raw = await structuredCall({
      system: SYSTEM,
      user: `Sortert handleliste:\n\n${sorted.map((s, i) => `${i + 1}. ${s.name}`).join("\n")}\n\nNy vare: ${item.name}`,
      schema: OUTPUT_SCHEMA,
      maxTokens: 1000,
    });
    const parsed = AiResponseSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ placed: false });

    const k = Math.max(0, Math.min(sorted.length, parsed.data.place_after));
    const orders = sorted.map((s) => s.sort_order as number);
    const newOrder =
      k === 0 ? orders[0] - 1 : k === sorted.length ? orders[orders.length - 1] + 1 : (orders[k - 1] + orders[k]) / 2;

    const { error } = await supabase.from("shopping_items").update({ sort_order: newOrder }).eq("id", item.id);
    return NextResponse.json({ placed: !error });
  } catch {
    return NextResponse.json({ placed: false });
  }
}
