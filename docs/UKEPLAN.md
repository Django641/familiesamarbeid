# Lekser (ukeplan fra skolen) — spesifikasjon

Besluttet av eieren 13. okt etter forslag fra `ux-designer` og `brukerstemme`. Dette er det som bygges.

## Akseptkriterier (eierens perspektiv)
1. På mobil kan jeg laste opp ukeplanen (PDF eller ett/flere skjermbilder) for Ada og/eller Lea i én operasjon.
2. Jeg får ett godkjenningsark per barn der Claude har sortert: **datoer og «ta med» → kalenderen**, **lekser/oppgaver → Lekser**, **ukens mål → «Mål:»-linje**. Alt er forhåndshuket unntatt det som alt finnes i kalenderen. Jeg kan flytte en rad til en annen gruppe, endre dag/tekst eller fjerne den før jeg lagrer. Ingenting lagres før jeg trykker Lagre.
3. Under **Lekser** i bunnmenyen ser jeg uka per barn (Begge/Ada/Lea), dag for dag, og kan krysse av lekser. Den andre telefonen ser det innen ~5 s. Originalen er ett trykk unna.
4. Bunnmenyen er `Hjem · Kalender · Handle · Lekser · Beskjeder · ⋯`. ⋯ viser resten (Gjøremål, Filer); Innstillinger via tannhjulet. Under Innstillinger → Bunnmeny velger jeg selv hvilke fem som står nederst (huskes per telefon).
5. På Hjem ser jeg et lite kort «Lekser i dag / til i morgen» (tillegg, ikke hovedsak).

## Fordeling
| Fra ukeplanen | Havner | Hvordan |
|---|---|---|
| Tur, foreldremøte, fridag, aktivitetsdag | Kalender | Vanlig hendelse, kategori `skole`, personen = barnet |
| Ta med (gymtøy, bibliotekbok, svømmetøy, matpakke til tur) | Kalender | Heldagshendelse på dagen, tittel med emoji, f.eks. «🩳 Gymtøy», kategori `skole`, personen = barnet |
| Lekser og ting barnet skal gjøre | Lekser | Rad med avkrysning, under dagen den skal være ferdig til («til tirsdag» → tirsdag), ukelekser under «Hele uka» |
| Ukens mål («Jeg kan 7-gangen») | Lekser | «Mål:»-linjer øverst i uka, ingen avkrysning |
| Timeplan med fag, generell info | — | Ikke lagret (står i originalen) |

**Dubletter:** en kalenderrad er ikke forhåndshuket hvis det finnes en hendelse samme Oslo-dato, samme barn (person_ids inneholder barnet) og nesten lik tittel (normalisert, uten emoji/store bokstaver) — gjelder også gjentakende «Gymtøy hver torsdag». Passerte datoer er heller ikke forhåndshuket.

## Navigasjon
- `components/mobile-nav.tsx`: fem valgte punkter + «⋯ Mer» (alltid sist). Mer åpner `Sheet` med de øvrige sidene.
- Tilgjengelige punkter: Hjem, Kalender, Handle, Lekser, Gjøremål, Beskjeder, Filer. Standard: Hjem, Kalender, Handle, Lekser, Beskjeder.
- Valget huskes per telefon i cookie `bunnmeny` (kommaseparert, valideres mot lista; ugyldig → standard). Leses på server i layout så menyen ikke blinker.
- Innstillinger → Bunnmeny: liste med avkrysning, maks 5 (og min 1). Hjem anbefales, men er ikke tvunget.
- Aktiv side bak ⋯ markerer ⋯ som aktiv.

## Lekser-siden `/lekser`
- Toppfelt «Lekser», chips Begge/Ada/Lea (bare personer med kind = barn), uke ‹ › («Uke 43 · 19.–23. okt»). URL `?uke=2026-10-19&barn=<id>`.
- Standard uke: denne uka; fra fredag kl. 14 neste uke hvis den finnes.
- Øverst i uka: «Mål:»-linjer per barn, og 📄-lenker til originalene (`/api/filer/[id]`).
- «Hele uka» først, så dagene man–fre (helg bare hvis noe står der). Dagens dag markert.
- Rad: stor sirkel til venstre (avkrysning, optimistisk) + tekst; under Begge med barnets initial/farge-prikk. Trykk på tekst → bunnark: tekst, dag-chips [Hele uka][Ma]…[Fr], type [Lekse][Mål], Slett (med `UndoToast`). «＋ Legg til» for noe læreren sa muntlig.
- Tom uke: stort kort «Ingen ukeplan for uke 43 [📷 Last opp ukeplan]». Knappen «＋ Last opp ukeplan» også nederst.

## Opplasting og godkjenning
1. Filvelger `accept="image/*,application/pdf"`, `multiple`. Hver fil: original → privat Blob (som Dokumenter, `category: "ukeplan"`, **skjult fra Filer-lista**), nedskalert kopi (`prepareUpload`) → `POST /api/ai/parse-weekly-plan`. Flere filer for samme barn/uke (flere skjermbilder) slås sammen i ett ark.
2. AI-ruta returnerer: `person` (navn fra familielista eller ""), `week_start` (mandag YYYY-MM-DD), `goals[]`, `homework[] {text, due: YYYY-MM-DD | ""(hele uka)}`, `calendar[] {title, date, start_time, end_time, all_day, kind: "hendelse"|"ta_med", notes}`, `explanation`. Ingenting lagres av ruta.
3. Godkjenningsark per barn (egen visning, ikke bunnark): «Gjelder [Ada][Lea]», «Uke ‹ ›», grupper **Til kalenderen · n**, **Lekser · n**, **Mål · n**. Avkrysning til venstre, gruppe-brikke til høyre; trykk på rad → bunnark med tekst, «Hvor?» [Kalender][Lekse][Mål], dag/dato (+ klokkeslett/Hele dagen for kalender). Knapp «Lagre: 3 i kalenderen, 8 lekser», deretter «Neste: Lea ›».
4. Lagring (én Server Action, transaksjon): upsert `homework_weeks` (person, week_start) — finnes uka, spør «Erstatt?» og erstatt bare radene som kom fra ukeplanen (behold avkryssing for identisk tekst); sett inn lekser/mål; kalenderrader via samme validering som `createEvents`; koble dokumentet til uka. Avbryt → slett blob + dokument.

## Datamodell (migrasjon 0003)
- `homework_weeks`: id, person_id → people (cascade), week_start date (mandag), created_by, created_at, updated_at, unique(person_id, week_start).
- `homework_items`: id, week_id → homework_weeks (cascade), kind text (`lekse`|`mal`), due_date date null (= hele uka), text, done bool, done_at, position int, created_by, created_at, updated_at. Indeks på (week_id, due_date).
- `homework_week_documents` eller `documents.homework_week_id` (nullable fk, set null) — dokumenter med verdi skjules fra Filer.
- Sync-triggere på nye tabeller.

## Hjem-kort (lite)
Før kl. 14: «Lekser i dag», etter: «Lekser til i morgen» (fredag ettermiddag/helg → mandag). Per barn: lekser på én linje, trykk → `/lekser`. Skjules når ingen har noe.

## Kan vente
Kveldspush, push når planen mangler, timeplan/fag, automatisk opprydding av gamle originaler.
