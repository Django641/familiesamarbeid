---
paths:
  - "app/api/**"
  - "lib/anthropic.ts"
  - "lib/ics*.ts"
---

# API-ruter

- Sjekk innlogget bruker først (`supabase.auth.getUser()`), 401 ellers. Unntak: `/api/ics/[token]` og `/api/cron/*`, som har egen beskyttelse.
- Valider input med zod (v4: `z.uuid()`, `z.string()`, osv.). Norske feilmeldinger som kan vises direkte i UI.
- `export const runtime = "nodejs"` + `maxDuration` på ruter som kaller eksterne tjenester.
- AI går via `structuredCall()` i `lib/anthropic.ts`. Bytt modell der, ikke i rutene.
- Fire-and-forget fra klienten (push, auto-innsortering) skal aldri gi feil til brukeren.
