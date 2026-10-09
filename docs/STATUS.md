# Status og backlog

Prosjektets statusfil. Prosjektlederen holder den oppdatert. Les den først i hver økt.

## ⏳ Venter på eieren (oppsett)

Se `docs/OPPSETT.md` for steg-for-steg.

- [ ] Opprett Vercel-prosjekt koblet til GitHub-repoet `familiesamarbeid`
- [ ] Legg til Supabase via Vercel Marketplace (region Frankfurt) og koble til prosjektet
- [ ] Kjør `supabase/migrations/0001_init.sql` i Supabase → SQL Editor
- [ ] Supabase Auth: URL-konfigurasjon (Site URL + redirect-URL-er) og e-postbekreftelse
- [ ] Env-variabler i Vercel: `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, VAPID-nøkler
- [ ] Begge lager konto, inviterer hverandre, legger appen på Hjem-skjermen og slår på varsler
- [ ] Abonner på familiekalenderen i Outlook (jobb) og evt. Google/iPhone
- [ ] Spond → Google-kalender «Barna» → lim inn iCal-lenken under Innstillinger

## 🔎 Venter på verifisering i praksis

- [ ] Kalenderimport av Spond via Google-kalender (gjentakende hendelser, endringer, slettinger)
- [ ] Outlook-abonnement på jobb (noen arbeidsgivere blokkerer internettkalendere)
- [ ] «Fra tekst» på ekte meldinger fra Skolemelding/Spond
- [ ] Push-varsler på begge iPhoner

## ✅ Gjort

- [x] Grunnmur: Next.js 16, Supabase-auth (e-post/passord), husstand med invitasjonskode, personer (voksne + barn) med farger
- [x] **Kalender:** agenda per dag, filter per person, kategorier, flerdagsreiser, gjenta ukentlig/annenhver uke, rediger/slett (også hele serien)
- [x] **«Fra tekst»:** lim inn melding → AI foreslår hendelser → rediger → lagre
- [x] **Kalenderabonnement ut** (ICS med hemmelig token per bruker) for Outlook/Google/iPhone
- [x] **Kalenderimport inn** (ICS-lenker, f.eks. Spond via Google), Vercel Cron hver 30. min + «Synk nå»
- [x] **Handleliste** portert fra Hyttekompis: dagligvare/annet, butikkgruppering, AI-sortering etter butikkrekkefølge, auto-innsortering, rediger, rydd med angre
- [x] **Gjøremål** med ansvarlig og frist, «Mine»-filter, rydd med angre
- [x] **Beskjeder** (chat-stil) med festing — festede vises på Hjem
- [x] **Dokumenter** i privat bucket med kategorier
- [x] **Hjem:** vær Helsfyr + Hedalen, festede beskjeder, frister, neste sju dager
- [x] Live-synk (Supabase Realtime), web push, PWA, mørk modus
- [x] Claude Code-oppsett: agenter med modellvalg, skills, regler, hooks

## 🧭 Beslutninger

- **Database:** Supabase via Vercel Marketplace (ikke Neon) — gir auth, Realtime og Storage i én tjeneste, og samme mønster som Hyttekompis. Faktureres via Vercel.
- **AI:** Anthropic (samme nøkkel som Hyttekompis), Claude Opus 5.5 med lav effort. OpenAI trengs ikke nå.
- **Spond:** ingen offisiell API, og vi lagrer ikke Spond-passord. Spond synker til en Google-kalender som appen importerer via iCal. Uoffisielle Spond-API-er er vurdert og valgt bort (bryter lett, krever passord).
- **Skolemelding:** ingen API/eksport. Dekkes av «Fra tekst» (kopier meldingen inn).
- **Handleliste:** to statuser (må kjøpes / kjøpt) — «pakket» var hytte-spesifikt.
- **Gjentakelse:** «gjenta ukentlig» lager enkeltkopier med felles `series_id` (enkelt, redigerbart per gang). Ekte RRULE kun via import.
- **Dokumenter:** Supabase Storage (ikke Vercel Blob) så tilgang styres av samme RLS-modell.

## ❌ Vurdert og droppet

- **Uoffisiell Spond-API med brukernavn/passord** — skjør og krever lagring av passord.
- **GitHub Actions CI** — unødvendig så lenge alt går via Claude-økter som kjører `npm run check`.

## 📋 Backlog (prioritert)

Se også `docs/IDEER.md` for forslag som venter på eierens vurdering.

### P1
- [ ] Ukevisning (7 kolonner) som alternativ til agenda
- [ ] Rediger ett gjøremål (tittel/frist/ansvarlig) i lista
- [ ] Angre ved sletting av enkeltvare/hendelse
- [ ] Varsel kvelden før/morgenen samme dag for hendelser (push via cron)

### P2
- [ ] Videresend e-post til appen → hendelsesutkast (inbound e-post, f.eks. Resend)
- [ ] Ukentlig e-postoppsummering til begge (privat og/eller jobb)
- [ ] Bilder/vedlegg på hendelser (f.eks. invitasjon til bursdag)

### P3
- [ ] Offline-lesing (cache siste data)
