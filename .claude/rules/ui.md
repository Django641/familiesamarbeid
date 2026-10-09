---
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
---

# UI-regler

- Mobil først, én hånd: trykkflater ≥ 44 px, input ≥ 16 px, native `<select>`/dato/tid.
- Farger kun via CSS-variablene i `app/globals.css` (fungerer i lys og mørk modus).
- Dato/tid via `lib/utils.ts` — alltid Europe/Oslo.
- Mutasjon: optimistisk state → Server Action; rollback ved feil.
- Lister: ett kort med rader, stor avkrysning til venstre, trykk på raden → `Sheet` for redigering, `UndoToast` etter sletting.
- Bokmål. Ikonknapper har `aria-label`. Feilmeldinger har `role="alert"`.
