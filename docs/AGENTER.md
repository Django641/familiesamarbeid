# Agentteamet og modellvalg

Oppsettet følger Claude Code-praksis per oktober 2026: én hovedøkt som orkestrerer, og spesialiserte subagenter i `.claude/agents/` med egen systemprompt, egne verktøy, eget modellvalg og (for noen) eget minne i `.claude/agent-memory/`.

## Hvem gjør hva

| Agent | Modell / effort | Verktøy | Minne | Hvorfor denne modellen |
|---|---|---|---|---|
| **prosjektleder** (hovedøkta) | Opus 5.5 / high | alle | prosjekt | Planlegging, prioritering og helhetsvurderinger tjener mest på den sterkeste modellen. |
| **produktutvikler** | Opus 5.5 / high | les + nett + `docs/IDEER.md` | prosjekt | Åpen, uklar idéutvikling — her betaler dybde og dømmekraft seg. Får frihet til å foreslå ting eieren ikke har bedt om. |
| **database** | Opus 5.5 / high | les/skriv/Bash | – | RLS og migrasjoner er sikkerhetskritiske og vanskelige å reversere. |
| **kvalitetskontroll** | Opus 5.5 / high | bare lesing + Bash | prosjekt | Skal finne feil andre har oversett; billigere å fange dem her enn i produksjon. |
| **frontend** | Sonnet 5.5 / medium | les/skriv/Bash | – | Godt spesifisert UI-arbeid i stort volum; Sonnet er rask og sterk nok, til halv pris av Opus. |
| **integrasjoner** | Sonnet 5.5 / high | les/skriv/Bash + nett | – | Mye «følg API-dokumentasjonen»-arbeid. High effort fordi tidssoner og ICS er fallgruver. |
| **utforsker** | Haiku 5.5 / low | bare lesing | – | Søk i kodebasen — mekanisk, og Haiku er raskest og billigst. |

Prinsippet (Anthropic, «Choosing a Claude model and effort level», juli 2026): mindre modell for rutinepregede og presist beskrevne oppgaver, større modell for vanskelige feil, ukjente domener og arkitektur. Behold standard effort for det meste.

## Overstyre modell

- Én gang: be prosjektlederen bruke en annen modell for én delegering («la frontend bruke Opus på dette»).
- Alltid: endre `model:`/`effort:` i agentfila. Gyldige verdier: `opus`, `sonnet`, `haiku`, `fable`, `inherit` eller full ID (`claude-opus-5-5`).
- Alle på én modell (f.eks. for å spare): miljøvariabelen `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` + `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`.
- Fable 5.1 er sterkest, men dyrest; aktuelt for lange, flerstegs og uklare oppgaver (f.eks. et større redesign). Ikke standard.

## Hovedøkta som prosjektleder

I Claude Code på nett/mobil er hovedøkta prosjektleder via `CLAUDE.md`. I terminalen kan du i tillegg starte med `claude --agent prosjektleder`, som gir hele økta prosjektlederens systemprompt.

## Skills

| Skill | Type | Hva |
|---|---|---|
| `/ny-funksjon` | prosjekt | Fast flyt: avklar → DB → integrasjon → UI → kvalitet → dokumenter → lever |
| `/db-migrasjon` | prosjekt | Ny nummerert migrasjon med RLS, realtime og typer |
| `/kvalitetssjekk` | prosjekt | `npm run check` + sjekkliste |
| `/idemyldring` | prosjekt | Kjører `produktutvikler` i egen kontekst |
| `/lever-endring` | prosjekt (kun manuell) | Commit → PR → merge |
| `vercel-react-best-practices` | Vercel | 70 ytelsesregler for React/Next |
| `web-design-guidelines` | Vercel | UI/UX-/tilgjengelighetsreview |
| `supabase-postgres-best-practices` | Supabase | Skjema, RLS, indekser, migrasjoner |

Eksterne skills er kopiert inn (ikke symlinket) så de fungerer i skyøkter; versjonene er låst i `skills-lock.json`. Oppdater med `npx skills update`.

## Hooks og regler

- `SessionStart` (`.claude/hooks/session-start.sh`): installerer npm-pakker i skyøkter.
- `PreToolUse` (`.claude/hooks/protect-migrations.sh`): stopper redigering av committede migrasjoner.
- `.claude/rules/*.md`: stibaserte regler (Supabase, API, UI) som bare lastes når relevante filer røres.
