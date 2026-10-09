---
name: db-migrasjon
description: Lager en databaseendring trygt med Drizzle — endrer skjemaet i kode, genererer nummerert migrasjon, legger til sync-trigger og typer, og tester lokalt. Bruk ved enhver endring av tabeller, kolonner, indekser eller databasefunksjoner.
argument-hint: "[hva som skal endres]"
paths:
  - "lib/db/**"
  - "drizzle/**"
  - "lib/types.ts"
---

# Databaseendring: $ARGUMENTS

Eksisterende migrasjoner:

!`ls drizzle`

1. Endre `lib/db/app-schema.ts` (egenskapsnavn i snake_case, `timestamp(..., { withTimezone: true })`, `uuid().defaultRandom()`).
2. `npm run db:generate -- --name <kort_navn>`. Les SQL-en som ble laget og sjekk at den tåler eksisterende data (standardverdier før `not null`, ingen utilsiktet `drop`).
3. Ny tabell som skal live-synkes: lag en tilleggsmigrasjon med `npx drizzle-kit generate --custom --name <tabell>_sync` som legger til
   `CREATE TRIGGER <tabell>_sync AFTER INSERT OR UPDATE OR DELETE ON "<tabell>" FOR EACH STATEMENT EXECUTE FUNCTION bump_sync_version();`
4. Legg typen i `lib/types.ts`.
5. Test lokalt mot en Postgres: `DATABASE_URL=… npm run db:migrate` (to ganger — andre gang skal være no-op).
6. `npm run typecheck`. Migrasjonen kjøres automatisk i neste Vercel-deploy; eieren trenger ikke gjøre noe.
