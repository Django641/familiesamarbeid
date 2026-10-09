---
name: kvalitetssjekk
description: Kjører prosjektets kvalitetsport (typecheck, lint, build) og en rask manuell sjekkliste for mobil, tilgjengelighet og sikkerhet. Bruk før commit/PR og når noe skal verifiseres.
allowed-tools: Bash(npm run *) Bash(git diff *) Bash(git status) Read Grep Glob
---

# Kvalitetssjekk

1. Kjør `npm run check` (= typecheck + lint + build). Alle tre må være grønne. Ved feil: fiks årsaken, ikke symptomet, og kjør på nytt.
2. Se over `git diff` for:
   - hemmeligheter eller `.env`-verdier i koden
   - Server Actions/API-ruter uten `requireUser()`/`getSession()`, eller server-only-moduler importert i `"use client"`-filer
   - `new Date().getHours()`, `toLocaleString()` uten `timeZone` (bruk `lib/utils.ts`)
   - ikonknapper uten `aria-label`, trykkflater under 44 px, input-tekst under 16 px
   - endrede filer i `drizzle/` som allerede fantes
3. Rapporter kort: hva som ble kjørt, resultat, og eventuelle funn.
