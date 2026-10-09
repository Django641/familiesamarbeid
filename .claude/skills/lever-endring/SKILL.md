---
name: lever-endring
description: Lander ferdig arbeid — kvalitetssjekk, commit, push til feature-branch, PR mot main og merge, med SQL/env-krav tydelig i PR-en. Bruk når en endring er ferdig og verifisert.
disable-model-invocation: true
argument-hint: "[kort beskrivelse]"
---

# Lever endring: $ARGUMENTS

Nåværende branch og status:

!`git branch --show-current && git status --short`

1. Kjør `/kvalitetssjekk`. Stopp hvis noe er rødt.
2. Er endringen ikke-triviell eller rører sikkerhet/RLS/auth? Kjør `kvalitetskontroll`-agenten og fiks alle 🔴.
3. Oppdater `docs/STATUS.md`.
4. Commit med en beskrivende melding på norsk (hva og hvorfor).
5. Push feature-branchen (`git push -u origin <branch>`). Aldri push direkte til `main`, aldri force-push.
6. Opprett PR mot `main`. Krever endringen SQL (ny migrasjon) eller nye env-variabler: legg det **øverst** i PR-beskrivelsen og gjenta det for eieren med hva som ikke virker før det er gjort.
7. Merge PR-en når sjekkene er grønne. Vercel deployer automatisk fra `main`.
