# Kvalitetskontroll — tilbakevendende feilmønstre

- Filservering (/api/filer/[id]): Content-Type kommer fra opplasteren (Blob). Sjekk at HTML/SVG/XML aldri serveres inline (stored XSS). Krev whitelist + attachment/CSP sandbox.
- `lastId`-mønster (setState under render) i bunnark: nullstilles ikke når arket lukkes -> gjenåpning av samme rad viser foreldet/ulagret state.
- `useEffect(() => setLocal(props), [props])`: Server Actions køes sekvensielt; svaret fra action 1 (revalidatePath) overskriver optimistiske endringer for action 2..n -> flimring. Se etter useOptimistic eller merge.
- Optimistisk oppdatering uten rollback når action returnerer `{ error }` (bare `catch` håndteres).
- Chat/temp-id: sjekk duplikater når server-props og action-svar begge inneholder den nye raden.
- Better Auth: passkey-registrering krever fersk sesjon (freshAge 1 døgn som standard) — med ettårs-sesjon feiler «Slå på Face ID» etter dag 1.
- Better Auth signup: ALLOWED_EMAILS uten e-postverifisering = den som registrerer seg først med e-posten får kontoen.
- sync_state-trigger (FOR EACH STATEMENT) låser én felles rad: transaksjoner med mange UPDATE-setninger kan deadlocke mot samtidige enkeltskriv.
- CSS grid med dynamisk `repeat(${n}, …)` i inline style: `repeat(0, …)` er ugyldig CSS -> hele grid-template forkastes. Sjekk n=0-tilfellet.
- `?fra=`-datoer validert bare med regex (`\d{4}-\d{2}-\d{2}`): `2026-13-45` gir Invalid Date -> `toISOString()` kaster RangeError -> 500. Krev rundtur-validering (addDays(k,0) === k).
- Oslo-datofunksjoner (`osloDateKey` = toLocaleDateString uten cachet formatter) kalt i nøstede løkker (uker x hendelser) blir tregt på mobil. Forhåndsberegn per hendelse.
- fetch mot egne API-ruter: Vercel svarer 413/504 med ikke-JSON -> `res.json()` kaster -> generisk «Noe gikk galt». Sjekk at status (spesielt 504 ved maxDuration) mappes til forståelig melding.
- Asynkront forarbeid (bildekonvertering o.l.) FØR `setBusy(true)` -> knapper er aktive i mellomtiden -> to parallelle kall, siste svar vinner.
- Tester (node:test + Playwright): `after(() => { assert…; await browser.close() })` — feiler assert, lukkes ikke nettleseren og testprosessen HENGER (bekreftet). Krev try/finally. Sjekk også at e2e-skriptet har totaltimeout.
- Regresjonstester for nettleserfeil som er Safari-spesifikke må teste selve fiksen (f.eks. «bildet sendes uendret, ingen canvas»), ikke bare symptomet — Chromium viser aldri symptomet.
- Testdatoer med `Date.now() + n*86_400_000` blir feil rundt sommertid-skiftet (25-timers døgn). Bruk datostreng + addDays.
- Fixtures: se etter ekte opplysninger om barna (skole, klasse, lag, fødselsår).
- Falske tjenester (Blob/Claude) bør registrere sikkerhetskritiske felt (access: private) så testen kan sjekke dem.
