---
name: kvalitetssjekk
description: Kjører prosjektets kvalitetsport (typecheck, lint, build) og en rask manuell sjekkliste for mobil, tilgjengelighet og sikkerhet. Bruk før commit/PR og når noe skal verifiseres.
allowed-tools: Bash(npm run *) Bash(npm test) Bash(git diff *) Bash(git status) Read Grep Glob
---

# Kvalitetssjekk

1. Kjør `npm run check` (= typecheck + lint + build) og `npm test` (enhetstester). Alt må være grønt. Ved feil: fiks årsaken, ikke symptomet, og kjør på nytt. Nettlesertestene (`npm run e2e`) kjøres i `/lever-endring` når brukerflyt eller integrasjoner er endret.
2. Se over `git diff` for:
   - hemmeligheter eller `.env`-verdier i koden
   - Server Actions/API-ruter uten `requireUser()`/`getSession()`, eller server-only-moduler importert i `"use client"`-filer
   - `new Date().getHours()`, `toLocaleString()` uten `timeZone` (bruk `lib/utils.ts`)
   - ikonknapper uten `aria-label`, trykkflater under 44 px, input-tekst under 16 px
   - endrede filer i `drizzle/` som allerede fantes
   - nye kall mot eksterne tjenester uten logging av metadata (se `.claude/rules/api.md`)
   - unødvendig omforming av brukerdata (f.eks. bilder) før sending — enkleste vei først
3. Rapporter kort: hva som ble kjørt, resultat, og eventuelle funn.
