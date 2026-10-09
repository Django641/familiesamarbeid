import { NextResponse } from "next/server";

import { syncCalendar } from "@/lib/ics-import";
import { createClient } from "@/lib/supabase/server";
import type { ExternalCalendar } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// «Synk nå» fra Innstillinger. Henter kalenderne med brukerens egen klient
// (RLS = bare egen husstand), og skriver deretter med admin-klienten i syncCalendar.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
  if (!process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: "SUPABASE_SECRET_KEY mangler i Vercel." }, { status: 503 });
  }

  const { data } = await supabase.from("external_calendars").select("*");
  const calendars = (data ?? []) as ExternalCalendar[];
  const results = await Promise.all(calendars.map((c) => syncCalendar(c)));
  return NextResponse.json({ results });
}
