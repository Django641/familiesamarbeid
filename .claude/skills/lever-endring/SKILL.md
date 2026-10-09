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

1. Kjør `/kvalitetssjekk`. Stopp hvis noe er rødt.
2. Er endringen ikke-triviell eller rører sikkerhet, innlogging eller datamodell? Kjør `kvalitetskontroll`-agenten og fiks alle 🔴.
3. Oppdater `docs/STATUS.md`.
4. Commit med en beskrivende melding på norsk (hva og hvorfor).
5. `git push -u origin <branch>`. Aldri force-push.
6. Krever endringen en databasemigrasjon eller nye env-variabler: si det tydelig til eieren, med eksakte navn/kommandoer og hva som ikke virker før det er gjort.
