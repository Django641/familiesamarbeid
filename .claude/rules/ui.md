---
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
---

# UI-regler

- Mobil først, én hånd: trykkflater ≥ 44 px, input ≥ 16 px, native `<select>`/dato/tid.
- Farger kun via CSS-variablene i `app/globals.css` (fungerer i lys og mørk modus).
- Dato/tid via `lib/utils.ts` — alltid Europe/Oslo.
- Mutasjon: optimistisk state → Supabase → `router.refresh()`; rollback ved feil.
- Bokmål. Ikonknapper har `aria-label`. Feilmeldinger har `role="alert"`.
