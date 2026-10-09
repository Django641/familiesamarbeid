# Testansvarlig — minne

## Skjøre flyter (fra første versjon, 9. okt 2026)
- Live-synk mellom to «telefoner» venter på 5-sekunders polling — gi god margin, ikke faste sleeps.
- Utklippstavle-testene (lim inn-knapp, ⌘V) krever `clipboard-read/write`-tillatelser i Chromium; Safari kan ikke testes her.
- «I dag»/«i morgen» kan bli feil rundt midnatt (Oslo) — beregn datoer i Europe/Oslo i testen.
- Better Auth: maks 3 innlogginger/registreringer per 10 s per IP → hver «telefon» får egen `x-forwarded-for`.
- `@vercel/blob` laster opp med strømmet fetch over HTTP/2 i Chromium; testbuilden bruker `http://localhost`, så SDK-en faller til XHR (som i Safari). HTTP/2-veien testes ikke.
- `npm run e2e` og `npm run check` bygger begge til `.next` — ikke kjør dem samtidig.

## Feil som har nådd eieren (skal ha test)
- Innliming på Mac (bilde/fil på utklippstavla) → `03-hurtigfelt`
- Hvitt bilde fra canvas-omkoding i Safari → `03-hurtigfelt` sjekker at bildet Claude får ikke er blankt
- Blob-opplasting feilet uten `BLOB_WEBHOOK_PUBLIC_KEY` → `05-dokumenter`
