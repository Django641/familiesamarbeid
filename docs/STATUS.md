# Status og backlog

Prosjektets statusfil. Prosjektlederen holder den oppdatert. Les den først i hver økt.

## ⏳ Venter på eieren

Se `docs/OPPSETT.md`.

- [ ] Koble Neon til Vercel-prosjektet (ett klikk) og redeploy
- [ ] Legg samboerens e-post i `ALLOWED_EMAILS` (din er lagt inn)
- [ ] Legg inn `ANTHROPIC_API_KEY` (valgfritt — AI-sortering og «Fra tekst»)
- [ ] Begge lager konto, legger appen på Hjem-skjermen og slår på Face ID og varsler

## 🔎 Venter på verifisering i praksis

- [ ] Face ID (passkeys) i appen fra Hjem-skjermen på iPhone
- [ ] Push-varsler på begge iPhoner
- [ ] Opplasting av store bilder/PDF-er til Blob fra iPhone
- [ ] «Fra tekst» på ekte meldinger fra Skolemelding/Spond

## ✅ Gjort

- [x] **Stack byttet til Vercel-integrerte tjenester** (eierens ønske): Neon Postgres + Drizzle, Better Auth (e-post/passord + Face ID, kun `ALLOWED_EMAILS`), Vercel Blob (privat), live-synk via databasetriggere + 5-sekunders spørring. Supabase er fjernet.
- [x] Vercel-prosjekt, Blob-lagring og miljøvariabler satt opp av Claude
- [x] **Kalender:** agenda per dag, filter per person, kategorier, flerdagsreiser, gjenta ukentlig/annenhver uke, rediger/slett (også hele serien)
- [x] **«Fra tekst»:** lim inn melding → AI foreslår hendelser → rediger → lagre. Kan også startes fra en beskjed.
- [x] **Handleliste:** alle funksjonene fra Hyttekompis (dagligvare/annet, butikkgruppering, AI-sortering, auto-innsortering, rydd med angre) med nytt utseende — trykk på vare for å redigere, angre ved sletting
- [x] **Gjøremål:** gruppert etter frist (Forfalt/I dag/I morgen/Denne uka/Senere), raske «hvem/når»-valg, rediger i bunnark, angre, «Mine og felles»
- [x] **Beskjeder:** chat med dag-skiller og grupperte bobler; trykk på beskjed → fest, gjør om til gjøremål, legg i kalenderen, kopier, slett
- [x] **Dokumenter:** privat Blob, søk, kategorier med antall, miniatyrbilder, fremdrift ved opplasting, gi nytt navn/flytt/last ned/slett
- [x] **Hjem:** vær Helsfyr + Hedalen, festede beskjeder, frister, neste sju dager
- [x] **Innstillinger:** familien (navn/farge), Face ID, push, tilgang (nytt passord for den andre voksne), logg ut
- [x] Ende-til-ende-test med to brukere (PGlite lokalt): oppstart, alle skjermer, live-synk på ~5 s, mørk modus
- [x] Claude Code-oppsett: agenter med modellvalg, skills, regler, hooks
- [x] Første `kvalitetskontroll`- og `produktutvikler`-runde
- [x] Andre `kvalitetskontroll`-runde (etter Neon-byttet): opplastede HTML/SVG-filer kan ikke kjøre script, invitasjonskode kreves etter første konto, Face ID-registrering virker også etter første døgn, raske avkrysninger hopper ikke tilbake, angre-data valideres, låsrekkefølge ved AI-sortering

## 🧭 Beslutninger

- **Database:** Neon via Vercel Marketplace (eierens valg), Drizzle ORM. Migrasjoner kjøres automatisk i builden — ingen manuell SQL.
- **Innlogging:** Better Auth i egen database (gratis, passkeys/Face ID). Vurdert: Neon Auth (beta, ingen passkeys) og Clerk (betalt for passkeys/allowlist).
- **Live-synk:** spørring hvert 5. s mens appen er synlig, mot en teller som databasetriggere øker. Enkelt, ingen ekstra tjeneste, og databasen sover når appen er lukket. Oppgraderingsvei hvis det trengs: Upstash Realtime.
- **Én familie, ingen husstand-modell:** tilgang styres av `ALLOWED_EMAILS` + innlogging.
- **Glemt passord uten e-post:** Face ID, eller den andre voksne setter nytt passord i Innstillinger.
- **AI:** Anthropic (samme nøkkel som Hyttekompis), Claude Opus 5.5 med lav effort. OpenAI trengs ikke nå.
- **Git:** én branch som deployes rett til produksjon, ingen PR-er.
- **Handleliste:** to statuser (må kjøpes / kjøpt) — «pakket» var hytte-spesifikt.
- **Gjentakelse:** «gjenta ukentlig» lager enkeltkopier med felles `series_id` (enkelt, redigerbart per gang).
- **Skolemelding:** ingen API/eksport. Dekkes av «Fra tekst».

## ❌ Vurdert og droppet

- **Uoffisiell Spond-API med brukernavn/passord** — skjør og krever lagring av passord.
- **Supabase** — byttet ut med Vercel-integrerte tjenester etter eierens ønske.
- **GitHub Actions CI** — unødvendig så lenge alt går via Claude-økter som kjører `npm run check`.

## 📋 Backlog (prioritert)

Se også `docs/IDEER.md` for forslag som venter på eierens vurdering.

### På vent (eieren vil ha dem senere — ikke glem)
- [ ] **Familiekalenderen i Outlook/Google/iPhone** (ICS-abonnement med hemmelig token per bruker). Ferdig bygget og testet tidligere — se `lib/ics.ts` og `app/api/ics/[token]/route.ts` i commit `50e5387`. Må tilpasses Drizzle/Neon (token-tabell + `api/ics`-rute utenfor innlogging).
- [ ] **Spond inn i kalenderen** (Spond → Google-kalender «Barna» → iCal-import med Vercel Cron). Bygget i `lib/ics-import.ts`, `app/api/cron/sync-calendars` og `innstillinger/external-calendars.tsx` i commit `50e5387`.

### P1
- [ ] Ta stilling til idéene i `docs/IDEER.md` (produktutviklerens første runde)
- [ ] **Kalenderen: Pakke 1** (Uker-visning, dagsark, bryter Uker/Liste, «Hvem kjører?») — plan i `docs/KALENDER.md`, venter på eierens ja
- [ ] Kalenderen: Pakke 2 og 3 — se `docs/KALENDER.md`
- [ ] Angre ved sletting av hendelse
- [ ] Varsel kvelden før/morgenen samme dag for hendelser (push via cron)

### P2
- [ ] Videresend e-post til appen → hendelsesutkast (inbound e-post, f.eks. Resend) — se `docs/IDEER.md`
- [ ] Passord-reset på e-post (Resend) hvis Face ID-løsningen ikke holder
- [ ] Ukentlig e-postoppsummering til begge (privat og/eller jobb)
- [ ] Bilder/vedlegg på hendelser (f.eks. invitasjon til bursdag)

### P3
- [ ] Offline-lesing (cache siste data)
