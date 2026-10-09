# Familiesamarbeid — instruksjoner for Claude Code

Privat PWA for et samboerpar i Oslo med to døtre (Ada 9, Lea 6). Felles kalender, handleliste, gjøremål, beskjeder og dokumenter som synkes live mellom to telefoner. **Ikke et kommersielt produkt** — to brukere, ingen markedsføring, ingen skalering. Målet: raskere og enklere enn SMS, Notes og å lete i Spond.

@AGENTS.md

**Les `docs/STATUS.md` først i hver økt.** Den sier hva som er gjort, hva som venter på eieren, hva som er droppet og hva som står i backloggen.

## Roller og agenter

Hovedøkta er **prosjektleder** (se `.claude/agents/prosjektleder.md`; kan også startes eksplisitt med `claude --agent prosjektleder`). Den planlegger, prioriterer, delegerer og holder `docs/STATUS.md` oppdatert. Spesialister i `.claude/agents/`:

| Agent | Modell | Brukes til |
|---|---|---|
| `database` | Opus 5.5 | Drizzle-skjema, migrasjoner, Neon, innlogging, `lib/types.ts` |
| `frontend` | Sonnet 5.5 | Sider, komponenter, mobil-UX, tilgjengelighet |
| `integrasjoner` | Sonnet 5.5 | AI-ruter, push, Blob-filer, vær, senere ICS/Spond |
| `kvalitetskontroll` | Opus 5.5 | Uavhengig review før push — leser kode (bare lesetilgang) |
| `testansvarlig` | Sonnet 5.5 | Skriver og kjører tester (`npm test`, `npm run e2e`) — kjører koden |
| `produktutvikler` | Opus 5.5 | Frie forslag eieren ikke har bedt om → `docs/IDEER.md` |
| `ux-designer` | Opus 5.5 | Visninger, flyt og skisser før noe bygges (bare lesetilgang) |
| `brukerstemme` | Sonnet 5.5 | Tester forslag mot familiens hverdag — «ville vi brukt dette?» |
| `utforsker` | Haiku 5.5 | Raske søk i kodebasen (valgfri — kodebasen er liten) |

Begrunnelse og når man bør overstyre modell: `docs/AGENTER.md`. Forslag fra `produktutvikler` bygges ikke uten eierens ja. **Små rettelser** (1–3 filer, tydelig årsak) gjør prosjektlederen selv; større funksjoner og dyp datamodell-/integrasjonsjobb delegeres. Kvalitetsporten gjelder uansett.

Prosjekt-skills: `/ny-funksjon`, `/db-migrasjon`, `/kvalitetssjekk`, `/idemyldring`, `/lever-endring`, `/sjekk-produksjon`. Eksterne skills (kopiert inn, låst i `skills-lock.json`): `vercel-react-best-practices`, `web-design-guidelines`, `supabase-postgres-best-practices` (gjelder Postgres generelt, også Neon). Oppdater med `npx skills update`.

## Stack

- Next.js 16 (App Router, Turbopack, `proxy.ts`, Server Actions) + React 19 + TypeScript strict + Tailwind v4
- **Neon Postgres** via Vercel Marketplace (fra1) + **Drizzle ORM** (`lib/db/`) over `pg`-pool med `attachDatabasePool`
- **Better Auth** (`lib/auth.ts`) i samme database: e-post/passord + Face ID (passkeys), bare e-poster i `ALLOWED_EMAILS`
- **Vercel Blob** (privat) for dokumenter — opplasting direkte fra nettleser, visning via `/api/filer/[id]`
- **Live-synk:** databasetriggere teller opp `sync_state.version`; `components/live-sync.tsx` spør `/api/sync` hvert 5. s mens appen er synlig
- Anthropic SDK (`lib/anthropic.ts`, Claude Opus 5.5, effort low, server-side fallback) for handleliste-sortering og «Fra tekst»
- Web push (VAPID) via `lib/push.ts`, met.no for vær (Helsfyr + Hedalen, `lib/config.ts`)
- Vercel-prosjekt `familiesamarbeid` → https://familiesamarbeid.vercel.app

## Kommandoer

```bash
npm run dev          # localhost:3000 (krever .env.local — `vercel env pull .env.local`)
npm run check        # typecheck + lint + build — må være grønt før commit
npm test             # enhetstester (tests/unit) — må være grønt før commit
npm run e2e          # nettlesertester mot lokal PGlite + falsk Claude/Blob (tests/e2e) — ved endret brukerflyt/integrasjon
npm run db:generate  # ny migrasjon fra endringer i lib/db/*-schema.ts
npm run db:migrate   # kjør migrasjoner (skjer også automatisk i Vercel-builden)
```

## Kodestil og mønstre

- Server Components henter data direkte med Drizzle (`db.select()…`), parallelt med `Promise.all`. Innlogget bruker/familie via `requireUser()` / `getFamily()` i `lib/session.ts` (React.cache).
- **Mutasjoner = Server Actions** (`app/(app)/<side>/actions.ts`): `requireUser()` først, valider med zod, skriv med Drizzle, `revalidatePath("/", "layout")`. Klienten oppdaterer lokal state optimistisk, kaller actionen og ruller tilbake ved feil.
- Push-varsler og AI-etterarbeid kjøres i `after()` så de aldri forsinker svaret.
- **Én familie:** ingen husstand-id. Alle innloggede (bare `ALLOWED_EMAILS`) ser alt. Personer (voksne + barn) ligger i `people`.
- **Tid:** alt lagres i UTC og vises i Europe/Oslo via `lib/utils.ts` (`osloDateKey`, `osloTime`, `osloToIso`). Aldri enhetens tidssone — de reiser i jobben. Heldagshendelser: `starts_at` = midnatt Oslo, `ends_at` = siste dag (inklusiv) eller null.
- **UI-mønstre:** grupperte lister i ett kort, rad = stor avkrysning til venstre + trykk på teksten for å redigere i `Sheet` (bunnark), `UndoToast` etter sletting/rydding, chips for raske valg. Trykkflater ≥ 44 px, input ≥ 16 px, `aria-label` på ikonknapper.
- Farger via CSS-variabler i `app/globals.css` (lys + mørk modus). Bokmål i all UI-tekst.
- Endre appnavn, værsteder og kategorier i `lib/config.ts`, ikke rundt om i koden.

## Sikkerhet — ufravikelig

1. Aldri commit hemmeligheter. `.env.local` er gitignored; `.env.example` dokumenterer navnene.
2. Appen er lukket: `proxy.ts` sender alle uten sesjons-cookie til `/login` (unntatt `/login` og `/api/auth/*`). Den ekte sjekken er `requireUser()` / `getSession()` i **hver** side, Server Action og API-rute.
3. Bare e-poster i `ALLOWED_EMAILS` kan lage konto (`databaseHooks` i `lib/auth.ts`). Etter første konto kreves i tillegg invitasjonskode (`lib/invite.ts`, HMAC av e-posten) — lenken lages under Innstillinger → Tilgang.
4. Filer i Blob er private og åpnes bare via `/api/filer/[id]` (sjekker innlogging, `Cache-Control: private`). Bare trygge typer (PDF, bilder, tekst) vises inline; alt annet lastes ned, med CSP-sandbox.
5. `lib/db`, `lib/auth.ts`, `lib/push.ts` har `import "server-only"` — aldri importer dem i klientkode.
6. AI-resultat som endrer innhold (f.eks. «Fra tekst») vises alltid for redigering før lagring. Unntak: sortering av handlelista (endrer bare rekkefølge).

## Database-migrasjoner

Endre skjemaet i `lib/db/app-schema.ts`, kjør `npm run db:generate`, og commit fila i `drizzle/`. Migrasjoner kjøres automatisk i Vercel-builden (`scripts/migrate.mjs`, upoolet URL) — eieren trenger ikke kjøre SQL. Migrasjonsfiler som er committet er append-only (en hook stopper redigering). Bruk `/db-migrasjon`.

## Git og levering

- **Én branch:** `claude/brave-galileo-fx7ekz` er eneste branch og produksjonsbranch. Vercel-prosjektet `familiesamarbeid` deployer automatisk ved hver push. Ingen PR-er, ingen `main`.
- **Ferdig arbeid pushes uten å spørre** når `npm run check` og `npm test` er grønne, `npm run e2e` er kjørt for endret brukerflyt/integrasjon, og `kvalitetskontroll` ikke har 🔴-funn (`/lever-endring`). Etter push: `/sjekk-produksjon`. Aldri force-push.
- **Hver feil som når eieren får en test** (`testansvarlig`).
- Push = produksjon, så halvferdig eller risikabelt arbeid pushes ikke. Krever endringen en databasemigrasjon eller nye env-variabler, si tydelig fra til eieren hva som må gjøres og hva som ikke virker før det er gjort.
- Ingen CI ennå (bevisst): kvalitetsporten kjøres i Claude-øktene. Testene mocker Claude og Blob og kjører Chromium — Safari/iPhone og ekte tjenester testes av eieren, og loggene sjekkes rett etterpå.

## Lærdommer (retro 9. okt)

- Feilene som nådde eieren virket i testoppsettet, men ikke i virkeligheten (Safari, ekte Blob, ekte Claude). Derfor: tester i repoet, falske tjenester som viser hva appen *sender*, logging av metadata fra starten, og `/sjekk-produksjon` etter push.
- Les dokumentasjon *og* bibliotekkode før integrasjonskode (`claude-api`-skillen for Claude; `node_modules/…/dist` for andre SDK-er).
- Enkleste vei først: ikke omform brukerdata unødvendig (bilder sendes uendret når de er små nok).

## Opphav

Handlelistas funksjoner er portert fra Hyttekompis (`Django641/hyttekompis`, se `docs/HANDLELISTE.md` der): kategorier, butikkgruppering, AI-sortering, auto-innsortering, rydd med angre. Avvik: to statuser (må kjøpes/kjøpt), nytt utseende, og AI-kall på serveren via Server Actions. Resten av appen er bevisst ikke modellert etter Hyttekompis.
