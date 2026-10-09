import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";

import { TopBar } from "@/components/top-bar";
import { buttonClass } from "@/components/ui/button";
import { buildAgenda, overlapFilter, rangeBounds } from "@/lib/events";
import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent } from "@/lib/types";
import { addDays, formatDate, osloDateKey } from "@/lib/utils";

import { Agenda } from "./agenda";

export const metadata = { title: "Kalender" };

const SPAN_DAYS = 42; // seks uker per «side»

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ fra?: string }>;
}) {
  const [{ household, people }, { fra }, supabase] = await Promise.all([
    getHousehold(),
    searchParams,
    createClient(),
  ]);

  const todayKey = osloDateKey(new Date());
  const fromKey = fra && /^\d{4}-\d{2}-\d{2}$/.test(fra) ? fra : todayKey;
  const toKey = addDays(fromKey, SPAN_DAYS - 1);
  const { startIso, endIso } = rangeBounds(fromKey, toKey);

  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("household_id", household.id)
    .lt("starts_at", endIso)
    .or(overlapFilter(startIso))
    .order("starts_at", { ascending: true })
    .limit(500);
  const events = (data ?? []) as CalendarEvent[];
  const days = buildAgenda(events, fromKey, toKey);

  return (
    <>
      <TopBar title="Kalender" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <div className="grid grid-cols-2 gap-2">
          <Link href="/kalender/ny" className={buttonClass("default", "default")}>
            <Plus className="h-5 w-5" aria-hidden /> Ny hendelse
          </Link>
          <Link href="/kalender/fra-tekst" className={buttonClass("secondary", "default")}>
            <Sparkles className="h-5 w-5" aria-hidden /> Fra tekst
          </Link>
        </div>

        <Agenda days={days} people={people} todayKey={todayKey} />

        <nav aria-label="Bla i kalenderen" className="mt-6 flex items-center justify-between gap-2">
          <Link
            href={`/kalender?fra=${addDays(fromKey, -SPAN_DAYS)}`}
            className={buttonClass("ghost", "sm")}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Tidligere
          </Link>
          <span className="text-xs text-[var(--color-muted)]">
            {formatDate(fromKey)} – {formatDate(toKey)}
          </span>
          <Link href={`/kalender?fra=${addDays(toKey, 1)}`} className={buttonClass("ghost", "sm")}>
            Senere <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </nav>
        {fromKey !== todayKey ? (
          <p className="mt-2 text-center">
            <Link href="/kalender" className="text-sm text-[var(--color-primary)] underline">
              Til i dag
            </Link>
          </p>
        ) : null}
      </main>
    </>
  );
}
