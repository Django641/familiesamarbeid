---
name: lever-endring
description: Lander ferdig arbeid — kvalitetssjekk, statusoppdatering, commit og push til den ene branchen (som deployes rett til produksjon), med tydelig beskjed om SQL/env-krav. Bruk når en endring er ferdig og verifisert.
disable-model-invocation: true
argument-hint: "[kort beskrivelse]"
---

# Lever endring: $ARGUMENTS

Nåværende branch og status:

!`git branch --show-current && git status --short`

Push går rett i produksjon (Vercel deployer branchen automatisk). Derfor:

1. Kjør `/kvalitetssjekk` (`npm run check` + `npm test`). Stopp hvis noe er rødt.
2. Rører endringen brukerflyt eller integrasjoner (AI, Blob, push, innlogging)? Kjør `npm run e2e` — eller la `testansvarlig` gjøre det og legge til tester for det nye. En feil som har nådd eieren skal ha fått en test.
3. Kjør `kvalitetskontroll`-agenten og fiks alle 🔴 (alltid for sikkerhet, innlogging, datamodell og integrasjoner; ellers ved ikke-trivielle endringer).
4. Oppdater `docs/STATUS.md`.
5. Commit med en beskrivende melding på norsk (hva og hvorfor).
6. `git push -u origin <branch>`. Aldri force-push.
7. Kjør `/sjekk-produksjon` til deployen er `READY` og loggene er rene.
8. Krever endringen en databasemigrasjon eller nye env-variabler: si det tydelig til eieren, med eksakte navn/kommandoer og hva som ikke virker før det er gjort. Si også hva eieren bør prøve selv (Safari/iPhone, ekte Claude/Blob).
