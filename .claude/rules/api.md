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
- **Logging fra starten** for alt som snakker med eksterne tjenester (Claude, Blob, push, met.no): én `console.info`/`console.error`-linje med *metadata* (type, størrelse, status/stop_reason, antall, varighet) — aldri innholdet i meldinger, filer eller personopplysninger. Feil fra biblioteker logges før de oversettes til en norsk melding, så de kan finnes med `/sjekk-produksjon`.
- **Les dokumentasjonen og bibliotekkoden før du skriver integrasjonskode.** Claude/Anthropic: last `claude-api`-skillen først (modell-ID, `max_tokens` med tenking, bilde-/PDF-grenser). Andre SDK-er (f.eks. `@vercel/blob`): les hva funksjonen faktisk krever i `node_modules/…/dist` — dokumentasjonen har hull (eks.: `handleUploadPresigned` krever `BLOB_WEBHOOK_PUBLIC_KEY` uansett).
- Integrasjoner testes mot de falske tjenestene i `tests/mocks/` (`npm run e2e`), og testen sjekker hva appen *sender*, ikke bare at kallet gikk.
