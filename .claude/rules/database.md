---
paths:
  - "lib/db/**"
  - "drizzle/**"
  - "lib/auth.ts"
  - "lib/session.ts"
  - "scripts/migrate.mjs"
---

# Database-regler

- Skjema: `lib/db/app-schema.ts` (appens tabeller), `lib/db/auth-schema.ts` (generert av Better Auth — ikke rediger for hånd).
- Ny endring: rediger skjemaet → `npm run db:generate` → commit fila i `drizzle/`. Committede migrasjoner endres aldri. Bruk `/db-migrasjon`.
- Migrasjoner kjøres i Vercel-builden mot `DATABASE_URL_UNPOOLED`. Appen bruker `DATABASE_URL` (poolet) via `lib/db/index.ts`.
- Nye datatabeller som skal live-synkes trenger `bump_sync_version()`-trigger.
- `lib/db`, `lib/auth.ts` og `lib/session.ts` er server-only.
