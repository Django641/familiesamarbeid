import "server-only";

// Felles deler av AI-rutene som tolker opplastet innhold (parse-events, parse-weekly-plan):
// vedlegg fra filopplasting, familie-/kjennetegn-tekst til systemprompten og norske feilmeldinger.

import Anthropic from "@anthropic-ai/sdk";

import type { AiAttachment } from "@/lib/anthropic";
import { db } from "@/lib/db";
import { people as peopleTable } from "@/lib/db/schema";
import { osloDateKey } from "@/lib/utils";

/** Maks størrelse per fil (Vercel tar maks 4,5 MB per kall, så nettleseren skalerer bilder ned først). */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** Gjør en opplastet fil om til vedlegg for Claude. Feil returneres som norsk melding. */
export async function attachmentFromFile(file: File): Promise<AiAttachment | string> {
  if (file.size > MAX_FILE_BYTES) return "Fila er for stor (maks 4 MB). Prøv et skjermbilde i stedet.";
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  if (file.type === "application/pdf") return { kind: "pdf", data };
  if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { kind: "image", mediaType: file.type as ImageType, data };
  }
  return "Bare bilder (JPEG, PNG, WebP) og PDF kan leses.";
}

/** Familielista slik den står i systemprompten, med kjennetegn de voksne har skrevet. */
export async function loadFamily(userId: string) {
  const people = await db
    .select({
      id: peopleTable.id,
      name: peopleTable.name,
      kind: peopleTable.kind,
      user_id: peopleTable.user_id,
      hints: peopleTable.hints,
    })
    .from(peopleTable);
  const family =
    people.map((p) => `- ${p.name} (${p.kind})${p.hints ? `: ${p.hints.replace(/\s+/g, " ")}` : ""}`).join("\n") ||
    "ukjent";
  const writer = people.find((p) => p.user_id === userId)?.name;
  return { people, family, writer };
}

/** «I dag»-opplysninger til systemprompten (Oslo-tid). */
export function todayInfo() {
  const today = osloDateKey(new Date());
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "long", timeZone: "UTC" });
  return { today, weekday };
}

/** Regelen for å koble en melding til riktig barn ut fra klasse/trinn og fødselsår. */
export const GRADE_RULE =
  "Klassetrinn regnes ut fra fødselsår: trinn = startåret for skoleåret − fødselsår − 5 (skoleåret starter i august; født 2017 → 4. trinn i skoleåret 2026/27). Står både fødselsår og en klasse i kjennetegnene, gjelder fødselsåret for trinnet (klassen kan være fra i fjor), mens bokstaven (f.eks. «B» i 4B) fortsatt gjelder.";

/** Norsk melding til brukeren for en feil fra Anthropic-SDK-en. `badRequest` er rutens egen tekst for 400. */
export function aiErrorMessage(error: unknown, badRequest: string): string {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "AI-nøkkelen virker ikke. Sjekk ANTHROPIC_API_KEY i Vercel.";
  }
  if (error instanceof Anthropic.RateLimitError) return "AI-tjenesten er travel akkurat nå. Prøv igjen om et minutt.";
  if (error instanceof Anthropic.BadRequestError) return badRequest;
  return "AI-tjenesten svarte ikke. Prøv igjen om litt.";
}
