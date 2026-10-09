---
paths:
  - "app/api/**"
  - "lib/anthropic.ts"
  - "app/**/actions.ts"
  - "lib/push.ts"
  - "lib/shopping-ai.ts"
---

# API-ruter

- Sjekk innlogget bruker først (`getSession()` i ruter, `requireUser()` i Server Actions), 401 ellers.
- Valider input med zod (v4: `z.uuid()`, `z.string()`, osv.). Norske feilmeldinger som kan vises direkte i UI.
- `export const runtime = "nodejs"` + `maxDuration` på ruter som kaller eksterne tjenester.
- AI går via `structuredCall()` i `lib/anthropic.ts`. Bytt modell der, ikke i rutene.
- Etterarbeid (push, auto-innsortering) kjøres i `after()` og skal aldri gi feil til brukeren.
