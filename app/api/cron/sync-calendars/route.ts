import { NextResponse } from "next/server";

import { syncCalendar } from "@/lib/ics-import";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ExternalCalendar } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron (se vercel.json) — synker alle abonnerte kalendere.
// Vercel sender «Authorization: Bearer $CRON_SECRET» automatisk.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin.from("external_calendars").select("*");
  const calendars = (data ?? []) as ExternalCalendar[];
  const results = await Promise.all(calendars.map((c) => syncCalendar(c)));
  return NextResponse.json({
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}
