# Familiesamarbeid — instruksjoner for Claude Code

Privat PWA for et samboerpar i Oslo med to døtre (Ada 9, Lea 6). Felles kalender, handleliste, gjøremål, beskjeder og dokumenter som synkes live mellom to telefoner. **Ikke et kommersielt produkt** — to brukere, ingen markedsføring, ingen skalering. Målet: raskere og enklere enn SMS, Notes og å lete i Spond.

**Les `docs/STATUS.md` først i hver økt.** Den sier hva som er gjort, hva som venter på eieren, hva som er droppet og hva som står i backloggen.

## Roller og agenter

Hovedøkta er **prosjektleder** (se `.claude/agents/prosjektleder.md`; kan også startes eksplisitt med `claude --agent prosjektleder`). Den planlegger, prioriterer, delegerer og holder `docs/STATUS.md` oppdatert. Spesialister i `.claude/agents/`:

| Agent | Modell | Brukes til |
|---|---|---|
| `database` | Opus 5.5 | Migrasjoner, RLS, Supabase, `lib/types.ts` |
| `frontend` | Sonnet 5.5 | Sider, komponenter, mobil-UX, tilgjengelighet |
| `integrasjoner` | Sonnet 5.5 | ICS inn/ut, Spond, cron, push, AI-ruter, vær |
| `kvalitetskontroll` | Opus 5.5 | Uavhengig review før merge (bare lesetilgang) |
| `produktutvikler` | Opus 5.5 | Frie forslag eieren ikke har bedt om → `docs/IDEER.md` |
| `utforsker` | Haiku 5.5 | Raske søk i kodebasen |

Begrunnelse og når man bør overstyre modell: `docs/AGENTER.md`. Forslag fra `produktutvikler` bygges ikke uten eierens ja.

Prosjekt-skills: `/ny-funksjon`, `/db-migrasjon`, `/kvalitetssjekk`, `/idemyldring`, `/lever-endring`. Eksterne skills (kopiert inn, låst i `skills-lock.json`): `vercel-react-best-practices`, `web-design-guidelines`, `supabase-postgres-best-practices`. Oppdater med `npx skills update`.

## Stack

- Next.js 16 (App Router, Turbopack, `proxy.ts`) + React 19 + TypeScript strict + Tailwind v4
- Supabase via **Vercel Marketplace**: Postgres + Auth (e-post/passord) + Realtime + Storage. Nøkler: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (klient/server) og `SUPABASE_SECRET_KEY` (kun `lib/supabase/admin.ts`)
- Anthropic SDK (`lib/anthropic.ts`, Claude Opus 5.5, effort low, server-side fallback) for handleliste-sortering og «Fra tekst»
- Vercel, region `fra1`, Vercel Cron hver 30. min for kalenderimport
- met.no for vær (Helsfyr + Hedalen, `lib/config.ts`)

## Kommandoer

```bash
npm run dev        # localhost:3000 (krever .env.local — `vercel env pull .env.local`)
npm run check      # typecheck + lint + build — må være grønt før commit
npm run typecheck
npm run lint
```

## Kodestil og mønstre

- Server Components som standard; `"use client"` bare for interaksjon. Datahenting med `Promise.all`; husstand/personer via `getHousehold()` (`lib/household.ts`, React.cache).
- **Mutasjoner:** optimistisk lokal state → Supabase-kall fra klienten (RLS er tilgangskontrollen) → `router.refresh()` ved suksess, rollback ved feil.
- **Live-synk:** `components/realtime-sync.tsx` lytter på husstandens tabeller og kaller `router.refresh()`. Nye tabeller legges inn der og i `supabase_realtime`-publikasjonen.
- **Tid:** alt lagres i UTC og vises i Europe/Oslo via `lib/utils.ts` (`osloDateKey`, `osloTime`, `osloToIso`). Aldri enhetens tidssone — de reiser i jobben. Heldagshendelser: `starts_at` = midnatt Oslo, `ends_at` = siste dag (inklusiv) eller null.
- Native HTML først (`<select>`, `<input type="date">`). Trykkflater ≥ 44 px, input ≥ 16 px, `aria-label` på ikonknapper.
- Farger via CSS-variabler i `app/globals.css` (lys + mørk modus).
- Bokmål i all UI-tekst. Små, fokuserte komponenter — ikke abstraher før tredje gang.
- Endre appnavn, værsteder og kategorier i `lib/config.ts`, ikke rundt om i koden.

## Sikkerhet — ufravikelig

1. Aldri commit hemmeligheter. `.env.local` er gitignored; `.env.example` dokumenterer navnene.
2. Appen er lukket: `lib/supabase/proxy.ts` sender alt til `/login` unntatt `/login`, `/auth/*`, `/bli-med/*`, `/api/ics/*` (hemmelig token) og `/api/cron/*` (`CRON_SECRET`).
3. Alle tabeller med `household_id` har RLS med `public.is_household_member(household_id)`. `household_members` skrives kun via SECURITY DEFINER-RPC.
4. `createAdminClient()` bypasser RLS — bare i server-kode uten innlogget bruker (cron, ICS-feed, push-utsending), alltid med manuelt `household_id`-filter.
5. Filer ligger i privat bucket `family-files` under `<household_id>/`, åpnes via signerte URL-er.
6. AI-resultat som endrer innhold (f.eks. «Fra tekst») vises alltid for redigering før lagring. Unntak: sortering av handlelista (endrer bare rekkefølge).

## Database-migrasjoner

`supabase/migrations/NNNN_*.sql` er append-only — en hook stopper redigering av committede migrasjoner. Eieren kjører nye filer i Supabase → SQL Editor. Bruk `/db-migrasjon`. Kjørte migrasjoner listes i `docs/OPPSETT.md`.

## Git og levering

- Standardbranch er `main`; Vercel deployer derfra. Arbeid på feature-branch → PR mot `main` → merge. Aldri force-push, aldri push direkte til `main`.
- **Ferdig arbeid landes uten å spørre** når `npm run check` er grønt og `kvalitetskontroll` ikke har 🔴-funn: lag PR og merge i samme økt (`/lever-endring`).
- Krever endringen SQL eller nye env-variabler: merges likevel, men SQL/variabelnavn står øverst i PR-beskrivelsen og gjentas for eieren med hva som ikke virker før det er gjort. Bare halvferdig eller risikabelt arbeid holdes tilbake.
- Ingen CI ennå (bevisst): kvalitetsporten kjøres i Claude-øktene.

## Opphav

Handlelista er portert fra Hyttekompis (`Django641/hyttekompis`, se `docs/HANDLELISTE.md` der). Avvik: to statuser (må kjøpes/kjøpt) i stedet for tre, og `household_id` i stedet for `cabin_id`.
