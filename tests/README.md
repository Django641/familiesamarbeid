# Tester

To lag. Begge skal være grønne før push (se `CLAUDE.md`).

## `npm test` — enhetstester (under 1 s)

`tests/unit/*.test.ts`, kjøres med `node:test` + `tsx`. Ren logikk uten database eller nettleser:
datoer og tidssone (`lib/utils.ts`, inkl. sommertid-skiftet 25.10.2026), ukeoppsettet i kalenderen
(`lib/week-layout.ts`, inkl. uke 53) og hendelsesutkast (`lib/event-draft.ts`).

## `npm run e2e` — nettlesertester (ca. 45 s med build)

`scripts/e2e.mjs` gjør alt selv og rydder opp etterpå (også ved feil og Ctrl-C):

1. starter **PGlite** (ekte Postgres i WebAssembly) med en tom database i en temp-mappe og kjører migrasjonene
2. starter **falsk Claude** (`tests/mocks/anthropic.mjs`) og **falsk Vercel Blob** (`tests/mocks/blob.mjs`)
3. `next build` + `next start` med test-miljø (ingen `.env.local`, ingen ekte nøkler, uten `BLOB_WEBHOOK_PUBLIC_KEY`)
4. kjører `tests/e2e/*.test.mjs` én fil om gangen i Chromium (`playwright-core`, nettleseren fra `PLAYWRIGHT_BROWSERS_PATH`)

```bash
npm run e2e                     # alt
npm run e2e -- --no-build       # gjenbruk forrige e2e-build (ca. 35 s)
npm run e2e -- kalender         # bare filer med «kalender» i navnet
npm run e2e -- --keep           # behold database og logger (ellers bare ved feil)
```

`01-auth-onboarding` lager familien (Kari + Mia og Noa) og samboeren (Ola). De andre filene gjenbruker
innloggingen. Kjøres en fil alene, lages eieren automatisk.

### Hva som mockes

- **Claude:** `ANTHROPIC_BASE_URL` peker til den falske serveren. Testen bestemmer svaret
  (`nextAiResponse`) og leser hva appen sendte (`lastAiRequest`: modell, effort, systemprompt,
  bilder/PDF som base64). Bildetestene dekoder bildet i nettleseren og sjekker at det ikke er blankt.
- **Vercel Blob:** `VERCEL_BLOB_API_URL` (server) og `NEXT_PUBLIC_VERCEL_BLOB_API_URL` (nettleser, bakt
  inn i test-builden). Den falske serveren utsteder signerte tokens og sjekker signaturen på
  opplastingen slik Vercel gjør. `tests/mocks/network.mjs` lastes inn i `next start` og sender
  `*.blob.vercel-storage.com` (nedlasting) og `api.met.no` (vær) til den falske serveren.

### Hva som IKKE dekkes

- **Safari / iPhone.** Bare Chromium kjører her. Lim inn, bildekonvertering (hvite bilder!), Face ID
  og PWA-oppførsel må eieren prøve på telefonen og Mac-en.
- **Ekte Claude.** Testene sjekker hva vi sender og hvordan vi håndterer svaret, ikke om Claude
  tolker riktig.
- **Ekte Vercel Blob.** I test bruker nettleseren XHR mot Blob (som Safari); Chromium i produksjon
  strømmer opplastingen over HTTP/2 med `fetch`. Signatur- og URL-formatet er lest fra
  `@vercel/blob` og kan endre seg ved oppgradering.
- **Neon-spesifikt** (pooling, SSL) og **web push** (VAPID er av i test).
- Live-synk testes, men den spør bare hvert 5. sekund, så den testen tar ca. 6 s.
