# Kalenderen — plan etter agentdrøfting (9. oktober 2026)

Eieren ba teamet tenke ut hva som gjør kalenderen (appens viktigste verktøy) virkelig nyttig, og nevnte «mange uker under hverandre». Drøftingen gikk i to runder mellom `ux-designer`, `produktutvikler`, `brukerstemme` og `frontend`, og prosjektlederen samlet den. **Ingenting er bygget ennå. Pakke 1 venter på eierens ja.**

## Det alle var enige om

- **Ja til «mange uker under hverandre»**, kalt «Uker». Denne visningen svarer på spørsmål som agendaen ikke klarer:
  - «Er du borte neste uke?»
  - «Er vi ledige 14.–16. november?»
  - «Hvordan ser høsten ut?»

  Tomme dager vises, en reise er én sammenhengende stolpe, og ukenummer er med (skole og jobb snakker i «uke 43»).
- **Listen skal ikke bort.** Uker og Liste byttes med en bryter. Uker er standard i Kalender-fanen, fordi Hjem allerede viser neste 7 dager som liste. Valget huskes per telefon.
- **Detaljer ligger i dagsarket, ikke i rutenettet.** På 375 px er hver dag bare ca. 48 px bred. Tekst er derfor lesbar bare i stolper (reiser, ferier, heldag). Hendelser med klokkeslett vises som kategori-emoji (⚽ 🎂 📌) med en personfarget strek under.
- **Trykk på en dag** åpner dagsarket med dagens hendelser og en stor knapp «＋ Ny torsdag 15. okt». Det oppretter ikke noe direkte, så et feiltrykk gjør ingen skade.
- **Droppet:** måned (en dårligere «Uker»), tidsakse og egen per-person-visning. Familien har få tidsbestemte hendelser per dag, og per-person-visningen dekkes av stolpene og en «Borte»-chip.
- **Ingen sideveis sveip.** Det kolliderer med iOS' tilbake-gest. Man ruller loddrett.

## Skisse (Uker, 375 px)

```
 Oktober 2026          [Uker|Liste]
     ma  ti  on  to  fr  lø  sø
 42  12  13  14 (15) 16  17  18
     ✈️ K Bergen ──────┤
     ├──── Høstferie ─────────────┤
     ⚽      ⚽🎂     ⚽  ⚠
 ───────────────────────────────────
 43  19  20  21  22  23  24  25
             💼 S Kurs ─┤
     ⚽  🏊  ⚽
 ───────────────────────────────────
```

- Stolpene fordeles i høyst 2 baner per uke, sortert etter personrekkefølge, slik at de voksnes reiser havner øverst. Det som ikke får plass, vises som «+N» og står i dagsarket.
- Gjelder en hendelse én person, får stolpen personens farge og initial. Gjelder den flere, blir stolpen nøytral med initialprikker.
- ⚠ i en dag betyr «noe her trenger en voksen» (se Pakke 3).
- Hver dag er en knapp med full skjermlesertekst, for eksempel «torsdag 15. oktober, uke 42: Kjetil i Bergen, fotball Lea 17:15».

## Pakker (prosjektlederens anbefaling)

### Pakke 1 — oversikten (ca. 1–2 dager, én liten migrasjon)
1. **Uker-visning** med:
   - ukenummer og klebrig månedsnavn
   - stolper for flerdags- og heldagshendelser
   - emoji for hendelser med klokkeslett, og «+N»

   Den viser et fast vindu fra forrige uke og 10 uker fram, med knappen «Vis flere uker». Det er bevisst ikke uendelig rulling i første versjon: live-synk virker da som i dag, og vi unngår de to største tekniske risikoene, som er hopp i rullingen og fletting av synk.
2. **Dagsark** med dagens agenda og «＋ Ny [dato]». I Liste får hver dagsoverskrift en «＋».
3. **Bryter Uker/Liste**, som huskes per telefon. Pluss en «I dag»-knapp.
4. **Hvem kjører?** Hendelsen får et felt for ansvarlig voksen (`responsible_id`), valgt med chips i skjemaet. Det vises i dagsarket og i listen, og hendelser for barna uten ansvarlig får en gul «Hvem?».

   Det står i Pakke 1 fordi det var nr. 2 hos brukerstemmen, og fordi borte-varsel, påminnelser og kveldspush senere trenger å vite hvem som har ansvaret.

### Pakke 2 — raskere innlegging og vedlikehold
- **«Som sist».** Mens du skriver tittel, foreslås tidligere titler. Ett trykk fyller inn sted, kategori, personer, varighet og ansvarlig. Ingen AI.
- **Dato- og tidschips** i skjemaet: I dag / I morgen / Lør, og sist brukte klokkeslett.
- **Rediger serien.** Valgene blir «Bare denne / Denne og senere», og «Forleng serien». Treningstider flyttes hver sesong.
- **Angre ved sletting**, som allerede står som P1 i backloggen.
- **«Ny/Endret siden du sist så»:** en prikk på hendelsen og «3 endringer siden i går». Slik ser man hva den andre har lagt inn.

### Pakke 3 — borte og dekning
- **«Borte»-chip**, som viser bare reise og jobb.
- **Dekningsvarsel:** ⚠ på dagen og på Hjem når en barnehendelse kolliderer med at den ansvarlige, eller begge voksne, er borte. Varselet vises også i skjemaet før lagring.
- **Kontinuerlig rulling**, hopp til måned med iPhone-velgeren, og live-synk av alle lastede uker. Testes på ekte iPhone.

### Senere / krever beslutning
- **Hurtiglinje med naturlig språk** nederst i kalenderen, for eksempel «Lea tannlege tir 14:30». AI tolker teksten og viser et forhåndskort med [Lagre]/[Endre]. Bygges når «Fra tekst» har vist seg å treffe godt på ekte meldinger. «Som sist» kommer først.
- **Påminnelse per hendelse** (kvelden før, 1 uke før) og kveldspush «I morgen». Krever Vercel Cron, som er inkludert i Pro-planen.
- **Vær i dagscellene** (Helsfyr, og Hedalen for hyttehendelser).
- **Søk** i kalenderen.
- **Dra over flere dager** for å lage en hendelse over et datoområde.

## Spørsmål til eieren før vi bygger
1. Planlegger dere mest uker eller måneder fram? Er det jobbreiser eller fritidsaktiviteter som oftest skaper trøbbel?
2. Står jobbreiser og kamper i kalenderen, eller ligger de i Outlook/Spond? Uten at ting kommer inn blir Uker tom. Produktutvikleren foreslår å løfte **videresend e-post til appen** fra P2 til P1, fordi den dekker både Outlook-reiser og e-post fra skolen.
3. Vil dere bruke «Hvem kjører?» og trykke «Jeg tar den», eller avtales det best muntlig?
