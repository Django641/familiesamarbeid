---
name: ny-funksjon
description: Fast arbeidsflyt for å bygge en ny funksjon i Familiesamarbeid fra idé til landet endring — avklaring, datamodell, RLS, UI, live-synk, kvalitetssjekk og statusoppdatering. Bruk når eieren ber om en ny funksjon eller en større utvidelse.
argument-hint: "[beskrivelse av funksjonen]"
---

# Ny funksjon: $ARGUMENTS

Følg stegene i rekkefølge. Deleger til spesialistagentene der det står.

1. **Avklar.** Les `docs/STATUS.md` og sjekk at funksjonen ikke er droppet tidligere. Skriv 3–5 akseptkriterier fra eierens perspektiv («på mobil kan jeg …»). Spør eieren bare hvis noe er genuint uklart.
2. **Datamodell** (hvis nødvendig) → `database`-agenten: ny migrasjonsfil, RLS, realtime, `lib/types.ts`. Bruk `/db-migrasjon`.
3. **Server/integrasjon** (hvis nødvendig) → `integrasjoner`-agenten: API-ruter, eksterne kall, AI.
4. **UI** → `frontend`-agenten: Server Component-side + små klientkomponenter, optimistiske mutasjoner, mobilregler. Legg i bunnmenyen bare hvis den brukes daglig — ellers lenke fra Hjem eller Innstillinger.
5. **Live-synk:** ny tabell i `components/realtime-sync.tsx`. Push-varsel (`notifyHousehold`) bare når den andre faktisk bør få beskjed — ikke på hver avkrysning.
6. **Kvalitet:** `/kvalitetssjekk`, deretter `kvalitetskontroll`-agenten på diffen. Fiks alle 🔴.
7. **Dokumenter:** oppdater `docs/STATUS.md` (Gjort + eventuelle nye beslutninger). Krever endringen SQL eller env-variabler, skriv det i `docs/OPPSETT.md`.
8. **Land** med `/lever-endring`.
9. **Etterpå:** be `produktutvikler` om 2–3 naturlige neste steg for funksjonen og legg dem i `docs/IDEER.md`.
