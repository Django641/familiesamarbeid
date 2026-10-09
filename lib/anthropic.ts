import "server-only";

// Felles Anthropic-oppsett for AI-rutene. Bytt modell her, ikke i rutene.
//
// Claude Opus 5.5 med lav effort: rask nok for små oppgaver (sortering, tolke
// en melding), og presis på datoer. Server-side fallback ("default") gjør at et
// avslått kall automatisk kjøres på en annen modell i stedet for å feile.

import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = "claude-opus-5-5";
export const AI_BETAS = ["server-side-fallback-2026-07-01"];

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function createAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Ett strukturert kall: systemprompt + brukermelding inn, JSON etter `schema` ut.
 * Returnerer null ved avslag, tomt svar eller ugyldig JSON.
 */
export async function structuredCall(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<unknown | null> {
  const anthropic = createAnthropicClient();
  const response = await anthropic.beta.messages.create({
    model: AI_MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    betas: AI_BETAS,
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: opts.schema },
    },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  if (response.stop_reason === "refusal") return null;
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
