import "server-only";

// Felles Anthropic-oppsett for AI-rutene. Bytt modell her, ikke i rutene.
//
// Claude Opus 5.5 med lav effort: rask nok for små oppgaver (sortering, tolke
// en melding), og presis på datoer. Server-side fallback ("default") gjør at et
// avslått kall automatisk kjøres på en annen modell i stedet for å feile.

import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

export const AI_MODEL = "claude-opus-5-5";
export const AI_BETAS = ["server-side-fallback-2026-07-01"];

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function createAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/** Bilde- eller PDF-vedlegg til et AI-kall (base64 uten linjeskift). */
export type AiAttachment =
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string }
  | { kind: "pdf"; data: string };

/** Bygger brukermeldingen: vedlegg først, så teksten (anbefalt rekkefølge). */
export function userContent(text: string, attachments: AiAttachment[] = []): string | BetaContentBlockParam[] {
  if (attachments.length === 0) return text;
  const blocks: BetaContentBlockParam[] = attachments.map((a) =>
    a.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data } }
      : { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } }
  );
  blocks.push({ type: "text", text });
  return blocks;
}

/** Metadata om et kall — til logging (aldri innholdet). */
export type AiCallMeta = {
  stopReason: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Ett strukturert kall: systemprompt + brukermelding inn, JSON etter `schema` ut.
 * Returnerer null ved avslag, tomt svar eller ugyldig JSON.
 * `effort` er «low» som standard; bilder/PDF tjener på «medium».
 */
export async function structuredCall(opts: {
  system: string;
  user: string | BetaContentBlockParam[];
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  onMeta?: (meta: AiCallMeta) => void;
}): Promise<unknown | null> {
  const anthropic = createAnthropicClient();
  const response = await anthropic.beta.messages.create({
    model: AI_MODEL,
    // Tenkingen teller mot max_tokens, så gi god margin (svarene selv er små).
    max_tokens: opts.maxTokens ?? 16000,
    betas: AI_BETAS,
    fallbacks: "default",
    output_config: {
      effort: opts.effort ?? "low",
      format: { type: "json_schema", schema: opts.schema },
    },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  opts.onMeta?.({
    stopReason: response.stop_reason ?? null,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  for (const block of response.content) {
    if (block.type === "text") {
      try {
        return JSON.parse(block.text);
      } catch {
        return null;
      }
    }
  }
  return null;
}
