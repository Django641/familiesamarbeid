# Idéer

Forslag fra `produktutvikler`-agenten og eieren. Prosjektlederen flytter godkjente forslag til backloggen i `docs/STATUS.md`. Avviste forslag flyttes til «Avvist» med en kort begrunnelse, så de ikke foreslås igjen.

## Nye forslag

<!-- Runde 1 — 9. oktober 2026. Sortert etter verdi/innsats. Bygger på det som finnes i koden:
     Hjem, Kalender (+ «Fra tekst», ICS inn/ut), Handleliste, Gjøremål, Beskjeder, Dokumenter, Innstillinger, push ved nye hendelser. -->

### «I morgen»-push på kvelden (med vær-tips)
- **Problem:** Push sendes i dag bare når den andre legger inn noe. Det som faktisk glemmes er det som skjer *i morgen tidlig*: gymtøy, fotball etter skolen, at det er planleggingsdag, at det er din tur å levere. Ingen av dere åpner appen kl. 20 for å sjekke.
- **Forslag:** Vercel-cron hver kveld kl. 19:45 sender én push per voksen: «I morgen: Ada gym 🩳 · Lea fotball 17:15 Lille Tøyen · Frist: svar på bursdag til Emma · Regn hele dagen på Helsfyr – regntøy». Trykk åpner Hjem på morgendagen. Stille hvis det ikke er noe å si. Vær-linjen lages fra met.no-prognosen som allerede hentes: nedbør > 2 mm i tidsrommet 07–16 → «regntøy/støvler», under 0 °C → «ull og vinterdress», under −8 °C → «ekstra votter». Søndag kveld i stedet en kort «uka som kommer». Én av/på-bryter og tidspunkt per voksen i Innstillinger.
- **Verdi:** høy — treffer hver eneste skolekveld, og flytter informasjonen dit dere faktisk ser den (låseskjermen). Ingen ny registrering trengs.
- **Innsats:** S/M — ny cron-rute (`/api/cron/evening-brief`), gjenbruk av `buildAgenda`, `getForecast` og web-push fra `/api/notify`. Ingen AI nødvendig.
- **Avhengigheter:** liten tabell/kolonne for push-preferanser per bruker (av/på, tidspunkt). Vercel Cron (betalt plan har nok). Blir mye bedre sammen med «Ta med»-ukerytme og «Hvem henter» under.

### Hvem leverer og henter — med varsel når det kolliderer med reise
- **Problem:** Den viktigste daglige avtalen mellom to foreldre står ikke noe sted: hvem leverer Lea og Ada om morgenen, og hvem henter på AKS/fotball. Det løses muntlig hver uke, og det glipper når én av dere har jobbreise eller sent møte i Outlook-kalenderen.
- **Forslag:** En fast ukemal («man: Kjetil leverer, X henter 16:30 AKS») som settes én gang i Innstillinger, og som vises øverst på Hjem: «I dag: **du** henter Lea 16:30 (AKS)». Ett trykk på linja → «Bytt» → den andre får push «Kan du hente i dag?» med Ja/Nei. Appen sjekker automatisk mot kalenderen: har voksen A en `reise`/`jobb`-hendelse som overlapper en henting, vises et gult varsel på Hjem («Tirsdag: Kjetil er i Bergen, men står på henting») — gjerne en uke i forveien. Ferie/fri-dager (se forslag under) skjuler malen automatisk.
- **Verdi:** høy — daglig logistikk, og konfliktvarselet fanger nettopp de situasjonene der det går galt i dag. Gir også et ærlig bilde av fordelingen («denne måneden: 14 / 9 hentinger») uten å være en poengtavle.
- **Innsats:** M — tabeller `pickup_pattern` (ukedag, person_id barn, levere/hente, voksen, klokkeslett, sted) og `pickup_override` (dato, …), begge med RLS; Hjem-kort; konfliktsjekk i ren TS mot `events`.
- **Avhengigheter:** ny migrasjon. Konfliktsjekken blir bare så god som jobbreisene som ligger i kalenderen — derfor henger den sammen med e-post-innboksen under (Outlook-invitasjoner inn).

### Videresend-innboks: send e-post til appen → kalenderutkast
- **Problem:** «Fra tekst» krever at man kopierer tekst inn i appen. Men det meste kommer på e-post: Outlook-møteinnkallelser, flybekreftelser (SAS/Norwegian), tannlegeinnkalling, e-post fra Skolemelding/AKS, invitasjoner til foreldremøte, hyttebooking. På mobil er «Videresend» to trykk; kopier-lim er seks.
- **Forslag:** Hver voksen får en hemmelig adresse (f.eks. `kjetil-8f3k@inn.<domene>`). Videresend hva som helst dit → appen kjører samme AI-tolkning som «Fra tekst» (og leser `.ics`-vedlegg direkte uten AI) og legger utkastene i en «Til gjennomgang»-boks på Hjem. Ett trykk «Lagre» per utkast, eller rediger først. Kan også settes opp som automatisk Outlook-/Gmail-regel for bestemte avsendere (f.eks. alt fra skolen eller flyselskapet).
- **Verdi:** høy — fjerner den største friksjonen ved å få ting *inn* i kalenderen, og gjør jobbreiser synlige for den andre uten at man må dele hele jobbkalenderen. AI-resultatet lagres aldri uten bekreftelse.
- **Innsats:** M — Resend Inbound (webhook `email.received`, vedlegg hentes via Attachments API), rute `/api/inbound-email` som verifiserer signatur og slår opp token → husstand, tabell `inbox_drafts` (rå tekst + JSON-utkast, status) med RLS, ett kort på Hjem som gjenbruker utkast-redigeringen fra `fra-tekst`.
- **Avhengigheter:** Resend-konto (finnes for Hyttekompis) + MX-record på et subdomene, eller gratis `@<id>.resend.app`-adresse for å starte. `ANTHROPIC_API_KEY` (finnes). Personvern: e-post inneholder mer enn det som trengs — lagre bare utkast og slett råteksten etter 30 dager.

### Fri-dager og ferier: «Hvem har barna?»
- **Problem:** Planleggingsdager og skolefri er klassikeren som overrasker. Oslo publiserer skoleruta bare som nettside (ingen iCal), planleggingsdagene settes per skole, og AKS kan være stengt på egne planleggingsdager. AKS-ferietilbud krever påmelding med frist uker i forveien (høstferien hadde påmeldingsfrist i september). Neste store er juleferien (21.12.–1.1.) og vinterferien 22.–26. februar 2027.
- **Forslag:** (1) Skoleruta 2026/27 for Oslo legges inn som heldagshendelser «🏫 Skolefri» (statisk liste i `lib/config.ts`, oppdateres når 2027/28 publiseres i høst), og skolens planleggingsdager legges til med «Fra tekst». (2) Hver fri-dag/ferieuke får en enkel dekningsstatus: *AKS påmeldt · Hytta · Besteforeldre · Fri fra jobb · Ikke avklart*. (3) Hjem viser «Ikke avklart» med rødt fra 5 uker før, og oppretter automatisk gjøremålet «Meld på AKS vinterferie» med frist når dere legger inn fristen.
- **Verdi:** høy — få ganger i året, men hver gang det glipper koster det en hel arbeidsdag eller et stressende døgn. Gir også grunnlag for å planlegge hytteturer i ferier.
- **Innsats:** M — seed-data, kolonne/tabell for dekningsstatus per dato (`coverage`), Hjem-varsel, kobling til gjøremål.
- **Avhengigheter:** eieren legger inn skolens planleggingsdager og AKS-frister én gang per halvår (meldes ut via Skolemelding/AKS).

### Ukerytme og «Ta med» per barn
- **Problem:** Gymtøy-dag, svømming, bibliotekbok, frukt-/turdag, leksedag, fotballtrening — faste ting som gjentas hver uke, men som ikke hører hjemme som kalenderhendelser (de ville druknet agendaen). I dag ligger de i hodet til én av dere.
- **Forslag:** Per barn: en liste «fast hver tirsdag: gymtøy + innesko» (Ada), «torsdag: bibliotekbok» (Lea). Vises som små brikker under dagen på Hjem («Ta med: 🩳 gymtøy · 📚 bok») og i kvelds-pushen. Gjelder bare skoleuker (hoppes over i ferier fra forslaget over). Kalenderhendelser kan få egen «Ta med»-linje som huskes til neste gang med samme tittel (fotballkamp → «leggskinn, drikkeflaske, 50 kr til kiosk»).
- **Verdi:** høy/middels — liten ting, men ukentlig, og det er nettopp denne typen huskeliste som utgjør den usynlige mentale lasten.
- **Innsats:** S — tabell `routine_items` (person_id, ukedag, tekst, emoji, kun_skoleuker) med RLS, liste-editor i Innstillinger, visning på Hjem.
- **Avhengigheter:** ingen eksterne. Gir mest verdi sammen med kvelds-pushen.

### Frister blir gjøremål — med «svar i Spond»-kø
- **Problem:** «Fra tekst» lager i dag frister som heldagshendelser («Frist: svar innen …»). De forsvinner ut av syne når dagen er passert, og kan ikke hakes av. Spond-invitasjoner (kamper, dugnad, klassefest) krever *svar*, og den ICS-baserte Spond-importen viser hendelsen, men ikke om noen av dere har svart.
- **Forslag:** AI-tolkningen lager frister som **gjøremål** med forfallsdato og forslag til ansvarlig voksen (redigerbart før lagring). For importerte Spond-hendelser vises en liten «Svart?»-knapp i hendelsesvisningen; hendelser innen 10 dager som ikke er markert, samles i et kort «Venter på svar (3)» på Hjem. Ett trykk = markert som svart (deles med den andre, så dere ikke begge svarer — eller ingen).
- **Verdi:** middels/høy — Spond-svar og påmeldingsfrister er en vanlig kilde til «trodde du gjorde det».
- **Innsats:** S — endring i prompten/skjemaet i `/api/ai/parse-events` (felt `kind: event|deadline`), `fra-tekst` lagrer frister i `tasks`; kolonne `responded_at` på `events` (bevares ved ICS-upsert, siden upsert ikke rører kolonnen).
- **Avhengigheter:** liten migrasjon. Ingen ny API-kostnad.

### Årshjul og utløpsdatoer
- **Problem:** Ting som skjer sjelden glemmes helt: barnepass (barn under 10 år får pass som bare gjelder i 3 år — oppdages typisk to uker før sydenturen), Europeisk helsetrygdkort, tannlegekontroll, vaksiner i barnevaksinasjonsprogrammet, dekkskift (oktober/april), tømming av hytta før frost i Hedalen, fornyelse av forsikringer, AKS-søknad for neste skoleår.
- **Forslag:** En enkel liste «Årshjul» under Gjøremål: tittel, person, dato, «minn meg X uker før», gjenta årlig/hvert N år, valgfri kobling til et dokument (f.eks. skannet pass i Dokumenter). Når varselet slår inn, blir det et vanlig gjøremål med frist + push. Appen kan sjekke mot kalenderen: ligger det en `reise`-hendelse utenlands før passet utløper + 1 måned, vises et varsel.
- **Verdi:** middels — sjeldent, men dyrt når det glipper (pass, helsekort). Lav daglig støy.
- **Innsats:** S/M — tabell `reminders` med RLS, daglig cron som gjør forfalte påminnelser om til `tasks`, enkel liste-UI.
- **Avhengigheter:** eieren legger inn utløpsdatoene én gang. Pass/helsedata: lagre bare dato og tittel, ikke passnummer.

## Avvist
