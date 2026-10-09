import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Klient med secret key — BYPASSER RLS. Kun for server-kode som ikke har en
 * innlogget bruker (cron-synk, ICS-feed) eller må se andres rader (push).
 * Avgrens alltid spørringene manuelt til riktig household_id.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY mangler i miljøvariabler");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
