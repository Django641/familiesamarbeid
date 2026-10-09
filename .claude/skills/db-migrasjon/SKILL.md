---
name: db-migrasjon
description: Lager en ny Supabase-migrasjon trygt — nummerert fil, RLS-policy, realtime, typer og SQL eieren skal kjøre. Bruk ved enhver endring av tabeller, kolonner, indekser, policies eller databasefunksjoner.
argument-hint: "[hva som skal endres]"
paths:
  - "supabase/**"
  - "lib/types.ts"
---

# Databaseendring: $ARGUMENTS

Eksisterende migrasjoner:

!`ls supabase/migrations`

1. Lag `supabase/migrations/<neste nummer>_<kort_beskrivelse>.sql`. **Rediger aldri en eksisterende fil** (en hook stopper det).
2. Skriv idempotent SQL der det går (`if not exists`, `drop policy if exists` + `create policy`, `create or replace function`).
3. Ny tabell med `household_id`:
   - `alter table … enable row level security;`
   - policy `for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))`
   - indeks på `(household_id, <sorteringskolonne>)`
   - `updated_at`-trigger hvis tabellen har `updated_at`
   - legg til i `supabase_realtime` hvis den skal live-synkes (se blokken nederst i `0001_init.sql`)
4. Oppdater `lib/types.ts`.
5. Les `supabase-postgres-best-practices`-skillen for kolonnetyper, indekser og RLS-ytelse ved behov.
6. Kjør `npm run typecheck`.
7. I svaret til eieren og i PR-beskrivelsen: lim inn hele SQL-en øverst med instruks «Kjør i Supabase → SQL Editor», og si hva som ikke virker før den er kjørt. Legg migrasjonen i lista i `docs/OPPSETT.md`.
