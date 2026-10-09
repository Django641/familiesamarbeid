import { NextResponse } from "next/server";

import { buildIcs } from "@/lib/ics";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CalendarEvent, Person } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kalenderabonnement for Outlook/Google/iPhone. Ingen innlogging — tilgang via
// et langt, hemmelig token per bruker (calendar_feeds). Nytt token = gammel lenke slutter å virke.

const PAST_DAYS = 60;
const FUTURE_DAYS = 400;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!/^[a-f0-9]{32,128}$/.test(token)) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: feed } = await admin
    .from("calendar_feeds")
    .select("household_id, households ( name )")
    .eq("token", token)
    .maybeSingle();
  if (!feed) return new NextResponse("Not found", { status: 404 });

  const from = new Date(Date.now() - PAST_DAYS * 86_400_000).toISOString();
  const to = new Date(Date.now() + FUTURE_DAYS * 86_400_000).toISOString();
  const [{ data: events }, { data: people }] = await Promise.all([
    admin
      .from("events")
      .select("*")
      .eq("household_id", feed.household_id)
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at")
      .limit(3000),
    admin.from("people").select("*").eq("household_id", feed.household_id),
  ]);

  const household = feed.households as unknown as { name: string } | null;
  const body = buildIcs({
    name: household?.name ?? "Familien",
    events: (events ?? []) as CalendarEvent[],
    people: (people ?? []) as Person[],
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="familien.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
