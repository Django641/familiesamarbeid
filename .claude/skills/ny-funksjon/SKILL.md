---
name: ny-funksjon
description: Fast arbeidsflyt for å bygge en ny funksjon i Familiesamarbeid fra idé til landet endring — avklaring, datamodell, Server Actions, UI, live-synk, kvalitetssjekk og statusoppdatering. Bruk når eieren ber om en ny funksjon eller en større utvidelse.
argument-hint: "[beskrivelse av funksjonen]"
---

# Ny funksjon: $ARGUMENTS

Følg stegene i rekkefølge. Deleger til spesialistagentene der det står.

1. **Avklar.** Les `docs/STATUS.md` og sjekk at funksjonen ikke er droppet tidligere. Skriv 3–5 akseptkriterier fra eierens perspektiv («på mobil kan jeg …»). Spør eieren bare hvis noe er genuint uklart.
2. **Datamodell** (hvis nødvendig) → `database`-agenten: endre `lib/db/app-schema.ts`, generer migrasjon, sync-trigger, `lib/types.ts`. Bruk `/db-migrasjon`.
3. **Server** → Server Actions i `actions.ts` ved siden av siden (`requireUser()` + zod). Eksterne kall/AI → `integrasjoner`-agenten.
4. **UI** → `frontend`-agenten: Server Component-side + små klientkomponenter, optimistiske mutasjoner, de faste UI-mønstrene (kort-liste, bunnark, angre). Legg i bunnmenyen bare hvis den brukes daglig — ellers lenke fra Hjem eller Innstillinger.
5. **Live-synk:** ny tabell trenger sync-trigger (se `/db-migrasjon`). Push-varsel (`notifyOthers` i `after()`) bare når den andre faktisk bør få beskjed — ikke på hver avkrysning.
6. **Kvalitet:** `/kvalitetssjekk`, deretter `kvalitetskontroll`-agenten på diffen. Fiks alle 🔴.
7. **Dokumenter:** oppdater `docs/STATUS.md` (Gjort + eventuelle nye beslutninger). Krever endringen nye env-variabler, skriv det i `docs/OPPSETT.md`.
8. **Land** med `/lever-endring`.
9. **Etterpå:** be `produktutvikler` om 2–3 naturlige neste steg for funksjonen og legg dem i `docs/IDEER.md`.
