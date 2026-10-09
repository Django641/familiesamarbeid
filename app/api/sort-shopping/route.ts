import { NextResponse } from "next/server";
import { z } from "zod";

import { isAiConfigured, structuredCall } from "@/lib/anthropic";
import { STORE_ORDER } from "@/lib/store-order";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Full AI-sortering av dagligvarer etter butikk-rekkefølge (portert fra Hyttekompis).
// Modellen får og returnerer varenumre (1-basert), ikke UUID-er, så den ikke kan
// finne på id-er. Serveren mapper tilbake og garanterer en komplett permutasjon.

const RequestSchema = z.object({
  items: z
    .array(z.object({ id: z.string(), name: z.string().min(1) }))
    .min(2)
    .max(200),
});

const AiResponseSchema = z.object({ ordered: z.array(z.number().int()) });

const OUTPUT_SCHEMA = {
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

const SYSTEM = `Du sorterer en handleliste etter hvor varene sannsynligvis står i en typisk norsk dagligvarebutikk (Kiwi, Rema 1000, Coop, Meny), i den rekkefølgen man går gjennom butikken:

${STORE_ORDER}

Du får en nummerert liste med varer. Returner ALLE numrene nøyaktig én gang hver, i butikk-rekkefølge. Varer du er usikker på plasserer du der de mest sannsynlig hører hjemme — aldri utelat et nummer.`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });

  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI er ikke satt opp ennå (ANTHROPIC_API_KEY mangler)." }, { status: 503 });
  }

  const parsedBody = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: "Ugyldig forespørsel" }, { status: 400 });
  const { items } = parsedBody.data;

  try {
    const raw = await structuredCall({
      system: SYSTEM,
      user: `Sorter denne handlelisten etter butikk-rekkefølge:\n\n${items.map((item, i) => `${i + 1}. ${item.name}`).join("\n")}`,
      schema: OUTPUT_SCHEMA,
    });
    const parsed = AiResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "AI-en kunne ikke sortere listen. Prøv igjen." }, { status: 502 });
    }

    const seen = new Set<number>();
    const orderedIds: string[] = [];
    for (const n of parsed.data.ordered) {
      const index = n - 1;
      if (index >= 0 && index < items.length && !seen.has(index)) {
        seen.add(index);
        orderedIds.push(items[index].id);
      }
    }
    items.forEach((item, i) => {
      if (!seen.has(i)) orderedIds.push(item.id);
    });
    return NextResponse.json({ orderedIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return NextResponse.json({ error: `AI-feil: ${message}` }, { status: 502 });
  }
}
