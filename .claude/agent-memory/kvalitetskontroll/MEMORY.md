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
