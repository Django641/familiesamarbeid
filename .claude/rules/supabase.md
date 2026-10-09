---
paths:
  - "supabase/**"
  - "lib/supabase/**"
  - "lib/types.ts"
---

# Supabase-regler

- Migrasjoner i `supabase/migrations/` er append-only. Ny endring = ny nummerert fil. Bruk `/db-migrasjon`.
- Alle tabeller med `household_id` har RLS med `public.is_household_member(household_id)`.
- `household_members` skrives kun via SECURITY DEFINER-RPC-ene (`create_household_with_owner`, `join_household_by_code`).
- Nøkler: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` i klient/server, `SUPABASE_SECRET_KEY` kun i `lib/supabase/admin.ts` (har `import "server-only"`).
- Storage-bucket `family-files` er privat; sti starter med `<household_id>/`. Filer åpnes via signerte URL-er.
