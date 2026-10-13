# Ukeplan (skole) — designforslag 13. okt

Eierens ønske: last opp ukeplanen én gang → datoer havner i kalenderen, resten (lekser, ta med, info) i en egen ukeplan med avkrysning. Vurdert av `ux-designer` og `brukerstemme`. **Venter på eierens svar før bygging.**

## Plassering
- Ikke plass til 7. punkt i bunnmenyen («Beskjeder» blir avkortet).
- **Anbefalt (eierens forslag):** tredje bryter i Kalender: `Uker | Liste | Skole` (~322 av 343 px på 375 px-skjerm; «Ukeplan» blir for bredt og forveksles med «Uker»). Egen rute `/kalender/skole`, huskes ikke i visnings-cookien. Overskrift inne: «Ukeplan · uke 43».
- Reserve: Skole erstatter Filer i bunnmenyen (Filer → rute på Hjem) hvis Skole åpnes daglig.

## Flyt
1. «＋ Last opp ukeplan» (PDF/bilder, begge barna på én gang). Original → privat Blob (skjult fra Filer). Nedskalert kopi → ny rute `/api/ai/parse-weekly-plan`; Claude finner barn (kjennetegn) og uke.
2. Godkjenningsark per barn: grupper Til kalenderen / Ta med / Lekser / Info og mål. Alt forhåndshuket, unntatt dubletter i kalenderen (samme dato, barn, kategori skole) og passerte datoer. Trykk på rad → bunnark: tekst, «Hvor hører det hjemme?» (4 chips), dag-chips (ta med kan ha flere dager). Ingenting lagres før «Lagre».
3. Lekser står under dagen de skal være ferdige til; ukelekser under «Hele uka».

## Visning `/kalender/skole`
Chips Begge/Ada/Lea, uke ‹ ›, per dag: ta med-brikker, lekser med avkrysning (uten masing), hendelser fra planen med lenke til kalender, originalene ett trykk unna. Redigering i samme bunnark, angre ved sletting.

## Hjem-kort «Skole i dag / i morgen»
Før kl. 14 i dag, etter kl. 14 neste skoledag, fredag ettermiddag/helg → mandag. Per barn: ta med + lekser på én linje. «Ukeplan for uke 44 mangler: Lea [Last opp]» fra fredag. Skjules i ferier.

## Datamodell (migrasjon)
- `weekly_plans`: person_id, week_start (date), document_id(s), info.
- `weekly_plan_items`: plan_id, kind (`lekse`|`ta_med`|`info`), days/due_date, text, done, position.
- Sync-triggere på begge.

## Kan vente
Kveldspush «I morgen», push når planen mangler, timeplan/fag per dag, faste ta med-ting (`routine_items` i IDEER.md), automatisk opprydding av gamle originaler.

## Åpne spørsmål til eieren
1. Plassering: «Skole»-fane i Kalender (anbefalt) eller erstatte Filer?
2. Lekser: avkrysning, eller holder det å se dem?
3. Ta med: kunne trykkes «pakket ✓», eller bare vises?
4. Kommer planene som PDF eller skjermbilde, og samtidig for begge barna?
