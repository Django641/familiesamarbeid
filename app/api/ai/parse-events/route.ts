import { NextResponse } from "next/server";
import { z } from "zod";

import { isAiConfigured, structuredCall } from "@/lib/anthropic";
import { EVENT_CATEGORIES } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { osloDateKey } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

// «Lim inn tekst → hendelser»: tolker en melding (Spond, Skolemelding, e-post,
// SMS) til kalenderutkast. Resultatet LAGRES IKKE — klienten viser utkastene
// for redigering, og brukeren velger hva som lagres.

const RequestSchema = z.object({ text: z.string().trim().min(3).max(8000) });

const DraftSchema = z.object({
  title: z.string(),
  date: z.string(),
  start_time: z.string(),
  end_date: z.string(),
  end_time: z.string(),
  all_day: z.boolean(),
  location: z.string(),
  category: z.string(),
  people: z.array(z.string()),
  notes: z.string(),
});
const AiResponseSchema = z.object({ events: z.array(DraftSchema) });

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["events"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "date",
          "start_time",
          "end_date",
          "end_time",
          "all_day",
          "location",
          "category",
          "people",
          "notes",
        ],
        properties: {
          title: { type: "string", description: "Kort tittel på norsk, f.eks. «Foreldremøte 3B»" },
          date: { type: "string", description: "Startdato YYYY-MM-DD" },
          start_time: { type: "string", description: "HH:MM (24 t), eller tom streng hvis ukjent/heldag" },
          end_date: { type: "string", description: "Sluttdato YYYY-MM-DD (lik date hvis samme dag)" },
          end_time: { type: "string", description: "HH:MM, eller tom streng" },
          all_day: { type: "boolean" },
          location: { type: "string", description: "Sted, eller tom streng" },
          category: { type: "string", enum: EVENT_CATEGORIES.map((c) => c.value) },
          people: {
            type: "array",
            items: { type: "string" },
            description: "Navn på familiemedlemmer hendelsen gjelder (kun fra lista du fikk)",
          },
          notes: { type: "string", description: "Viktige detaljer: hva må med, frister, kontaktperson" },
        },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI er ikke satt opp ennå (ANTHROPIC_API_KEY mangler i Vercel)." },
      { status: 503 }
    );
  }

  const parsedBody = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: "Lim inn litt tekst først." }, { status: 400 });

  // Familiemedlemmene (RLS: bare egen husstand)
  const { data: people } = await supabase.from("people").select("name, kind");
  const family = (people ?? []).map((p) => `${p.name} (${p.kind})`).join(", ") || "ukjent";

  const today = osloDateKey(new Date());
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "long", timeZone: "UTC" });

  const system = `Du hjelper en norsk familie med å legge hendelser i en delt kalender. Du får en tekst (melding fra Spond, Skolemelding, e-post, SMS e.l.) og skal hente ut alle konkrete hendelser med dato.

I dag er ${weekday} ${today} (Europe/Oslo). Relative datoer («på tirsdag», «neste uke», «14.10.») tolkes ut fra dette, alltid fremover i tid.
Familien: ${family}.

Regler:
- Ta bare med hendelser som har en dato. Ikke finn på noe.
- Kategorier: avtale, reise, jobb, skole (skole/barnehage/SFO/foreldremøter), aktivitet (fotball, trening, kamper, cuper), bursdag, annet.
- «people»: bruk bare navn fra familielista. Gjelder det et barn (f.eks. klassen eller laget hennes), velg barnet.
- Frister («svar innen», «betal innen») blir egne heldagshendelser med tittel som starter med «Frist:».
- Tittelen skal være kort og forståelig uten resten av meldingen.`;

  try {
    const raw = await structuredCall({ system, user: parsedBody.data.text, schema: OUTPUT_SCHEMA });
    const parsed = AiResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Klarte ikke å tolke teksten. Prøv igjen." }, { status: 502 });
    }
    return NextResponse.json({ events: parsed.data.events.slice(0, 30) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return NextResponse.json({ error: `AI-feil: ${message}` }, { status: 502 });
  }
}
