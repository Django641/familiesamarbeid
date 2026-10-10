import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";

import { type AiAttachment, type AiCallMeta, isAiConfigured, structuredCall, userContent } from "@/lib/anthropic";
import { EVENT_CATEGORIES } from "@/lib/config";
import { db } from "@/lib/db";
import { people as peopleTable } from "@/lib/db/schema";
import { getSession } from "@/lib/session";
import { osloDateKey } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

// «Lim inn tekst → hendelser»: tolker en melding (Spond, Skolemelding, e-post,
// SMS), et bilde (skjermbilde, foto av et skriv) eller en PDF til kalenderutkast.
// Resultatet LAGRES IKKE — klienten viser utkastene for redigering, og brukeren
// velger hva som lagres.
//
// Tekst sendes som JSON { text }. Fil sendes som multipart: «fil» + valgfri «tekst».
// Bilder skaleres ned i nettleseren før opplasting (Vercel tar maks 4,5 MB per kall).

const RequestSchema = z.object({ text: z.string().trim().min(3).max(8000) });
const NoteSchema = z.string().trim().max(2000);

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** Leser forespørselen: tekst, eller fil (+ ev. tekst). Returnerer feilmelding som streng. */
type Input = { text: string; attachments: AiAttachment[]; log: { kind: string; bytes: number; mediaType?: string } };

async function readInput(request: Request): Promise<Input | string> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data")) {
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    return parsed.success
      ? { text: parsed.data.text, attachments: [], log: { kind: "tekst", bytes: parsed.data.text.length } }
      : "Lim inn litt tekst først.";
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("fil");
  if (!(file instanceof File) || file.size === 0) return "Fant ingen fil.";
  if (file.size > MAX_FILE_BYTES) return "Fila er for stor (maks 4 MB). Prøv et skjermbilde i stedet.";
  const note = NoteSchema.safeParse(form?.get("tekst") ?? "");
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  let attachment: AiAttachment;
  if (file.type === "application/pdf") attachment = { kind: "pdf", data };
  else if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
    attachment = { kind: "image", mediaType: file.type as ImageType, data };
  } else return "Bare bilder (JPEG, PNG, WebP) og PDF kan leses.";

  const extra = note.success && note.data ? `\n\nKommentar fra den som lastet opp: ${note.data}` : "";
  return {
    text: `Hent ut hendelsene fra ${attachment.kind === "pdf" ? "dokumentet" : "bildet"} over.${extra}`,
    attachments: [attachment],
    log: { kind: attachment.kind, bytes: file.size, mediaType: file.type },
  };
}

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
  repeat: z.enum(["none", "weekly", "biweekly"]).catch("none"),
  repeat_until: z.string().catch(""),
});
const AiResponseSchema = z.object({ events: z.array(DraftSchema), explanation: z.string() });

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["events", "explanation"],
  properties: {
    explanation: {
      type: "string",
      description:
        "Tom streng hvis du fant hendelser. Fant du ingen: én kort setning på norsk til brukeren om hvorfor (f.eks. «Bildet viser ingen datoer» eller «Teksten er uleselig»).",
    },
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
          "repeat",
          "repeat_until",
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
          repeat: {
            type: "string",
            enum: ["none", "weekly", "biweekly"],
            description: "«weekly»/«biweekly» bare når teksten sier at det gjentas fast hver/annenhver uke, ellers «none»",
          },
          repeat_until: {
            type: "string",
            description: "Siste dato for gjentakelsen YYYY-MM-DD hvis teksten sier det («til jul», «ut mars»), ellers tom streng",
          },
        },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI er ikke satt opp ennå (ANTHROPIC_API_KEY mangler i Vercel)." },
      { status: 503 }
    );
  }

  const input = await readInput(request);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

  const people = await db
    .select({ name: peopleTable.name, kind: peopleTable.kind, user_id: peopleTable.user_id, hints: peopleTable.hints })
    .from(peopleTable);
  const family =
    people.map((p) => `- ${p.name} (${p.kind})${p.hints ? `: ${p.hints.replace(/\s+/g, " ")}` : ""}`).join("\n") ||
    "ukjent";
  const writer = people.find((p) => p.user_id === session.user.id)?.name;

  const today = osloDateKey(new Date());
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "long", timeZone: "UTC" });

  const system = `Du hjelper en norsk familie med å legge hendelser i en delt kalender. Du får en tekst (melding fra Spond, Skolemelding, e-post, SMS e.l.) og skal hente ut alle konkrete hendelser med dato.

I dag er ${weekday} ${today} (Europe/Oslo). Relative datoer («på tirsdag», «neste uke», «14.10.») tolkes ut fra dette, alltid fremover i tid.
Familien (med kjennetegn de voksne har skrevet):
${family}${writer ? `\nDen som skriver er ${writer}: «jeg», «meg» og «min» betyr ${writer}.` : ""}

Du kan få et bilde (skjermbilde fra Spond/Skolemelding/e-post, foto av et skriv eller en invitasjon) eller en PDF i stedet for tekst — les da innholdet og bruk samme regler. Teksten kan være en lang melding med flere datoer, eller en kort notis skrevet av en av de voksne («konsert i morgen kl. 20», «Lea tannlege tir 14:30», «jobbreise Bergen 3.–5. nov»). En kort notis blir én hendelse.

Regler:
- Ta bare med hendelser som har en dato. Ikke finn på noe.
- Kategorier: avtale, reise, jobb, skole (skole/barnehage/SFO/foreldremøter), aktivitet (fotball, trening, kamper, cuper), bursdag, annet.
- «people»: bruk bare navn fra familielista. Bruk kjennetegnene til å koble meldingen til riktig person: klasse/trinn, skole, lag, aktivitet, arbeidsplass. En melding til «4. trinn» eller «4B» gjelder barnet som går der. Klassetrinn regnes ut fra fødselsår: trinn = startåret for skoleåret − fødselsår − 5 (skoleåret starter i august; født 2017 → 4. trinn i skoleåret 2026/27). Står både fødselsår og en klasse i kjennetegnene, gjelder fødselsåret for trinnet (klassen kan være fra i fjor), mens bokstaven (f.eks. «B» i 4B) fortsatt gjelder. Er det uklart hvem det gjelder, la «people» stå tom heller enn å gjette.
- Frister («svar innen», «betal innen») blir egne heldagshendelser med tittel som starter med «Frist:».
- Tittelen skal være kort og forståelig uten resten av meldingen.
- Faste ting som gjentas hver uke («fotballtrening hver tirsdag 17:30», «svømming annenhver torsdag til 12. mars»): ÉN hendelse på første kommende dato, med repeat = «weekly» eller «biweekly», og repeat_until = siste dato hvis den er oppgitt (ellers tom streng). Ikke lag én hendelse per uke. Står datoene oppramset (f.eks. en terminliste), blir hver dato en egen hendelse med repeat = «none».
- Reiser og jobbreiser over flere dager: én hendelse med date = første dag og end_date = siste dag.
- Bookingbekreftelser og skjermbilder fra nettsider/apper (fly, tog, buss, hotell, billetter, timebestillinger) er hendelser. Ignorer knapper og menyer («Add to calendar», «Cancel» o.l.). Flyreise tur/retur eller med flere etapper: lag ÉN reise-hendelse fra første avgang (dato + tid) til siste ankomst (end_date + end_time), tittel = reisemålet (f.eks. «Stavanger»), og skriv etappene i notatet (flynummer, avgang–ankomst, bookingreferanse). Enveisreise blir én hendelse med avgang og ankomst.
- Tekst på engelsk eller andre språk tolkes på samme måte; titler og notater skrives på norsk.`;

  let meta: AiCallMeta | null = null;
  try {
    const raw = await structuredCall({
      system,
      user: userContent(input.text, input.attachments),
      schema: OUTPUT_SCHEMA,
      effort: input.attachments.length > 0 ? "medium" : "low",
      onMeta: (m) => (meta = m),
    });
    const parsed = AiResponseSchema.safeParse(raw);
    // Bare metadata i loggen — aldri innholdet i meldinger eller filer.
    console.info(
      "parse-events",
      JSON.stringify({ ...input.log, ...(meta ?? {}), events: parsed.success ? parsed.data.events.length : null })
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Klarte ikke å tolke innholdet. Prøv igjen." }, { status: 502 });
    }
    return NextResponse.json({
      events: parsed.data.events.slice(0, 30),
      explanation: parsed.data.explanation.trim().slice(0, 300),
    });
  } catch (error) {
    // Detaljene logges på serveren; brukeren får en forståelig norsk melding.
    console.error("parse-events: AI-kallet feilet", error);
    let message = "AI-tjenesten svarte ikke. Prøv igjen om litt.";
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      message = "AI-nøkkelen virker ikke. Sjekk ANTHROPIC_API_KEY i Vercel.";
    } else if (error instanceof Anthropic.RateLimitError) {
      message = "AI-tjenesten er travel akkurat nå. Prøv igjen om et minutt.";
    } else if (error instanceof Anthropic.BadRequestError) {
      message = "AI-en klarte ikke å lese dette. Prøv et tydeligere bilde eller lim inn teksten.";
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
