import { NextResponse } from "next/server";
import { z } from "zod";

import { aiErrorMessage, attachmentFromFile, GRADE_RULE, loadFamily, MAX_FILE_BYTES, todayInfo } from "@/lib/ai-route";
import { type AiAttachment, type AiCallMeta, isAiConfigured, structuredCall, userContent } from "@/lib/anthropic";
import { getSession } from "@/lib/session";
import { addDays } from "@/lib/utils";
import { isDateKey, matchChild } from "@/lib/weekly-plan-draft";
import { isoWeek, mondayOf } from "@/lib/week-layout";

export const runtime = "nodejs";
export const maxDuration = 120;

// «Last opp ukeplan»: tolker ukeplanen fra skolen (PDF eller ett/flere skjermbilder av samme plan)
// til lekser, ukens mål og kalenderutkast for ÉT barn. Resultatet LAGRES IKKE — klienten viser
// godkjenningsarket (lib/weekly-plan-draft.ts), og brukeren velger hva som lagres.
// Spesifikasjon: docs/UKEPLAN.md.
//
// Forespørsel (multipart/form-data):
//   fil    gjentatt felt: én PDF, ELLER 1–MAX_IMAGES bilder (ikke blandet). Bilder skaleres ned i
//          nettleseren først (Vercel tar maks 4,5 MB per kall); filene til sammen maks MAX_TOTAL_BYTES.
//   tekst  valgfritt: kommentar fra den som laster opp («Dette er Leas plan»).

const MAX_IMAGES = 8;
const MAX_TOTAL_BYTES = 4.2 * 1024 * 1024;
const NoteSchema = z.string().trim().max(2000);

type Input = { text: string; attachments: AiAttachment[]; log: { kind: string; files: number; bytes: number } };

/** Leser filene fra forespørselen. Returnerer feilmelding som streng. */
async function readInput(request: Request): Promise<Input | string> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data")) return "Last opp ukeplanen som PDF eller bilde.";

  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("fil") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return "Fant ingen fil.";
  if (files.length > MAX_IMAGES) return `For mange filer (maks ${MAX_IMAGES}). Last opp en PDF eller færre bilder.`;

  const bytes = files.reduce((sum, f) => sum + f.size, 0);
  if (files.some((f) => f.size > MAX_FILE_BYTES) || bytes > MAX_TOTAL_BYTES) {
    return "Filene er for store (maks 4 MB til sammen). Prøv skjermbilder i stedet.";
  }

  const attachments: AiAttachment[] = [];
  for (const file of files) {
    const attachment = await attachmentFromFile(file);
    if (typeof attachment === "string") return attachment;
    attachments.push(attachment);
  }
  const pdfs = attachments.filter((a) => a.kind === "pdf").length;
  if (pdfs > 1) return "Last opp bare én PDF om gangen.";
  if (pdfs === 1 && attachments.length > 1) return "Last opp enten én PDF eller flere bilder, ikke begge deler.";

  const note = NoteSchema.safeParse(form?.get("tekst") ?? "");
  const extra = note.success && note.data ? `\n\nKommentar fra den som lastet opp: ${note.data}` : "";
  const what =
    pdfs === 1
      ? "Hent ut innholdet i ukeplanen i dokumentet over."
      : attachments.length === 1
        ? "Hent ut innholdet i ukeplanen på bildet over."
        : `De ${attachments.length} bildene over er deler av samme ukeplan (i rekkefølge). Hent ut innholdet i ukeplanen samlet.`;
  return {
    text: what + extra,
    attachments,
    log: { kind: pdfs === 1 ? "pdf" : "bilde", files: attachments.length, bytes },
  };
}

const AiResponseSchema = z.object({
  person: z.string().catch(""),
  week_start: z.string().catch(""),
  goals: z.array(z.string()).catch([]),
  homework: z.array(z.object({ text: z.string(), due: z.string().catch("") })).catch([]),
  calendar: z
    .array(
      z.object({
        title: z.string(),
        date: z.string().catch(""),
        start_time: z.string().catch(""),
        end_time: z.string().catch(""),
        all_day: z.boolean().catch(true),
        kind: z.enum(["hendelse", "ta_med"]).catch("hendelse"),
        notes: z.string().catch(""),
      })
    )
    .catch([]),
  explanation: z.string().catch(""),
});

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["person", "week_start", "goals", "homework", "calendar", "explanation"],
  properties: {
    person: {
      type: "string",
      description: "Navnet på barnet planen gjelder, nøyaktig som i familielista. Tom streng hvis det er uklart.",
    },
    week_start: {
      type: "string",
      description: "Mandag i uka planen gjelder, YYYY-MM-DD. Tom streng hvis uka ikke kan avgjøres.",
    },
    goals: {
      type: "array",
      items: { type: "string", description: "Ukens mål / læringsmål, kort på norsk («Jeg kan 7-gangen»)" },
    },
    homework: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "due"],
        properties: {
          text: { type: "string", description: "Hva barnet skal gjøre, kort på norsk («Les s. 12–15 i lesebok»)" },
          due: {
            type: "string",
            description:
              "Dagen leksa skal være ferdig til, YYYY-MM-DD («til tirsdag» → tirsdagens dato). Tom streng for ting som gjelder hele uka.",
          },
        },
      },
    },
    calendar: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "date", "start_time", "end_time", "all_day", "kind", "notes"],
        properties: {
          title: {
            type: "string",
            description:
              "Kort tittel på norsk. For kind «ta_med»: passende emoji først, f.eks. «🩳 Gymtøy», «📚 Bibliotekbok», «🏊 Svømmetøy».",
          },
          date: { type: "string", description: "Dagen det gjelder, YYYY-MM-DD" },
          start_time: { type: "string", description: "HH:MM (24 t), eller tom streng for heldag/ukjent" },
          end_time: { type: "string", description: "HH:MM, eller tom streng" },
          all_day: { type: "boolean", description: "Alltid true for kind «ta_med»" },
          kind: {
            type: "string",
            enum: ["hendelse", "ta_med"],
            description: "«hendelse» = noe som skjer på en dato (tur, foreldremøte, fridag). «ta_med» = noe barnet skal ha med.",
          },
          notes: { type: "string", description: "Viktige detaljer (oppmøtested, hva som trengs), eller tom streng" },
        },
      },
    },
    explanation: {
      type: "string",
      description:
        "Tom streng hvis du fant noe. Fant du ingenting: én kort setning på norsk til brukeren om hvorfor (f.eks. «Bildet viser ikke en ukeplan» eller «Teksten er uleselig»).",
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

  const { people, family, writer } = await loadFamily(session.user.id);
  const { today, weekday } = todayInfo();
  const thisMonday = mondayOf(today);

  const system = `Du hjelper en norsk familie med å lese ukeplanen fra skolen til ett barn. Du får et bilde (eller flere skjermbilder av samme plan) eller en PDF, og skal hente ut det familien trenger: ting som skal i kalenderen, lekser og ukens mål.

I dag er ${weekday} ${today} (Europe/Oslo), uke ${isoWeek(today)}. Mandag i denne uka er ${thisMonday}; neste mandag er ${addDays(thisMonday, 7)}. Ukeplaner gjelder oftest denne uka eller neste uke. Datoer og ukedager («til tirsdag», «torsdag 16. okt.») tolkes inne i den uka planen gjelder.
Familien (med kjennetegn de voksne har skrevet):
${family}${writer ? `\nDen som laster opp er ${writer}.` : ""}

Regler:
- «person»: finn barnet planen gjelder ut fra kjennetegnene: klasse/trinn, skole, lærer. Planen står ofte oppført for en klasse («4B») eller et trinn. ${GRADE_RULE} Bruk bare navn fra familielista, nøyaktig skrevet. Er det uklart hvem planen gjelder (eller en kommentar fra den som lastet opp sier det), bruk kommentaren; ellers la «person» stå tom heller enn å gjette.
- «week_start»: mandagen i uka planen gjelder (YYYY-MM-DD). Les den av ukenummer («Uke 43») eller datoer i planen; velg året slik at uka ligger nærmest i dag. Tom streng hvis uka ikke kan avgjøres.
- Del innholdet i fire grupper:
  1. «calendar» med kind «hendelse»: ting som skjer på en bestemt dato — tur, utflukt, foreldremøte, fridag/planleggingsdag, aktivitetsdag, fremføring. Med start_time/end_time (HH:MM) hvis klokkeslett står oppgitt, ellers all_day = true.
  2. «calendar» med kind «ta_med»: ting barnet skal ha med seg en bestemt dag — gymtøy, bibliotekbok, svømmetøy, skiutstyr, matpakke eller sitteunderlag til tur. Alltid all_day = true, tomme klokkeslett, og en kort tittel med passende emoji først: «🩳 Gymtøy», «📚 Bibliotekbok», «🏊 Svømmetøy», «🥪 Matpakke», «🎿 Skiutstyr». Detaljer (f.eks. «ta med drikkeflaske») kan stå i notes.
  3. «homework»: lekser og oppgaver barnet skal gjøre hjemme. «due» = dagen de skal være ferdige til («til tirsdag» → tirsdagens dato). Står det ingen dag, eller det gjelder hele uka («øv på glosene denne uka»), sett due til tom streng.
  4. «goals»: ukens mål / læringsmål («Jeg kan 7-gangen», «Vi øver på å skrive fortellinger»). Kort, i jeg-form hvis planen bruker det.
- Fra timeplanen: ta bare med noe når planen faktisk viser det, f.eks. at barnet har gym en bestemt dag → «🩳 Gymtøy» (ta_med) den dagen. Ikke ta med fagene i timeplanen ellers, og ikke generell informasjon (åpningstider, kontaktinfo, hilsener).
- Ikke finn på noe og ikke gjett datoer. Står en ting uten dag og hører ikke til hele uka, la den utgå heller enn å lage en dato.
- Ikke ta med samme ting to ganger (en lekse som både står i en tabell og i teksten).
- Alle titler og tekster skal være på norsk (oversett fra andre språk) og korte: ikke hele avsnitt fra planen.`;

  let meta: AiCallMeta | null = null;
  try {
    const raw = await structuredCall({
      system,
      user: userContent(input.text, input.attachments),
      schema: OUTPUT_SCHEMA,
      effort: "medium",
      onMeta: (m) => (meta = m),
    });
    const parsed = AiResponseSchema.safeParse(raw);
    // Bare metadata i loggen — aldri innholdet i planen eller filene.
    console.info(
      "parse-weekly-plan",
      JSON.stringify({
        ...input.log,
        ...(meta ?? {}),
        goals: parsed.success ? parsed.data.goals.length : null,
        homework: parsed.success ? parsed.data.homework.length : null,
        calendar: parsed.success ? parsed.data.calendar.length : null,
      })
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Klarte ikke å tolke ukeplanen. Prøv igjen." }, { status: 502 });
    }

    const plan = parsed.data;
    return NextResponse.json({
      // Bare barn fra familielista; ellers "" (brukeren velger «Gjelder» i godkjenningsarket).
      person: people.find((p) => p.id === matchChild(plan.person, people))?.name ?? "",
      week_start: isDateKey(plan.week_start) ? mondayOf(plan.week_start) : "",
      goals: plan.goals.map((g) => g.trim()).filter(Boolean).slice(0, 10),
      homework: plan.homework
        .map((h) => ({ text: h.text.trim(), due: isDateKey(h.due) ? h.due : "" }))
        .filter((h) => h.text)
        .slice(0, 40),
      calendar: plan.calendar
        .map((c) => {
          // «Ta med» er alltid heldag, uansett hva modellen skrev.
          const allDay = c.kind === "ta_med" || c.all_day;
          return {
            ...c,
            title: c.title.trim(),
            all_day: allDay,
            start_time: allDay ? "" : c.start_time,
            end_time: allDay ? "" : c.end_time,
            notes: c.notes.trim(),
          };
        })
        .filter((c) => c.title && isDateKey(c.date))
        .slice(0, 30),
      explanation: plan.explanation.trim().slice(0, 300),
    });
  } catch (error) {
    // Detaljene logges på serveren; brukeren får en forståelig norsk melding.
    console.error("parse-weekly-plan: AI-kallet feilet", error);
    const message = aiErrorMessage(
      error,
      "AI-en klarte ikke å lese ukeplanen. Prøv et tydeligere bilde eller en PDF."
    );
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
