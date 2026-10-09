---
name: sjekk-produksjon
description: Sjekker produksjon etter en push — at Vercel-deployen ble ferdig, at migrasjonene kjørte, at sidene svarer, og at det ikke kommer nye feil i loggene. Bruk rett etter hver push (det er en del av /lever-endring), og når eieren melder om en feil i appen.
argument-hint: "[valgfritt: commit-sha eller hva som skal sjekkes ekstra]"
---

# Sjekk produksjon $ARGUMENTS

Vercel-prosjekt `familiesamarbeid`: id `prj_f2mkYXCSU44hAlyoV7tZ5E07Vpag`, team `team_SGwIeidNuqAFb4tnrxBK3Kds`, domene https://familiesamarbeid.vercel.app. Bruk Vercel-verktøyene (MCP); ingen hemmeligheter skal leses eller vises.

Siste commit lokalt:

!`git log --oneline -1`

1. **Deploy:** `list_deployments` (limit 1, projectId over). Sjekk at `githubCommitSha` er siste commit. Vent til `state` er `READY` (sjekk byggeloggen med `list_deployment_events`, `direction: backward`, i stedet for å vente blindt). `ERROR` → les byggeloggen, finn årsaken og si fra.
2. **Migrasjoner:** byggeloggen skal ha «✓ Databasemigrasjoner er oppdatert.» Står det «Ingen DATABASE_URL», er databasen koblet fra.
3. **Svar fra appen:** `curl` mot `/login` (forvent 200) og `/hjem` (forvent 307 til `/login` uten innlogging).
4. **Logger:** `get_runtime_logs` med `level: ["error","fatal"]`, `since: "15m"`, og `group_by: "requestPath"` for oversikt. Se på nye feil (ikke kjent støy). For AI-tolkning finnes metadata-linjer `parse-events {...}` (type, størrelse, stop_reason, tokens, antall hendelser) — aldri innhold.
5. **Rapporter kort til eieren:** deployet (ja/nei), migrasjoner, eventuelle feil og hva eieren bør prøve selv — særlig ting som bare kan testes i Safari/iPhone eller mot ekte Claude/Blob (som `npm run e2e` bare mocker).

Ved feil som eieren melder: start med steg 4 rundt tidspunktet eieren oppgir, før du gjetter i koden.
