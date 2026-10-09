import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

import { TopBar } from "@/components/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { CALENDAR_VIEW_COOKIE } from "@/lib/config";
import { eventsInRange } from "@/lib/events-db";
import { getFamily } from "@/lib/session";
import { addDays, formatDate, osloDateKey } from "@/lib/utils";
import { mondayOf } from "@/lib/week-layout";

import { CalendarView } from "./calendar-view";
import { TextImport } from "./fra-tekst/text-import";
import { type CalendarMode, ViewToggle } from "./view-toggle";

export const metadata = { title: "Kalender" };

const LIST_SPAN_DAYS = 42; // Liste: seks uker per «side»
const DEFAULT_WEEKS = 11; // Uker: forrige uke + 10 fram
const MORE_WEEKS = 8;
const MAX_WEEKS = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Bare ekte datoer i et rimelig intervall — «2026-13-45» o.l. skal ikke gi 500. */
function validDate(value: string | undefined): string | null {
  if (!value || !DATE_RE.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year < 2000 || year > 2100) return null;
  return addDays(value, 0) === value ? value : null;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ fra?: string; uker?: string; visning?: string }>;
}) {
  const [{ people }, params, cookieStore] = await Promise.all([getFamily(), searchParams, cookies()]);

  const requested = params.visning ?? cookieStore.get(CALENDAR_VIEW_COOKIE)?.value;
  const mode: CalendarMode = requested === "liste" ? "liste" : "uker";
  const todayKey = osloDateKey(new Date());
  const fra = validDate(params.fra);

  let fromKey: string;
  let toKey: string;
  let weeks = 0;
  if (mode === "uker") {
    const defaultFrom = addDays(mondayOf(todayKey), -7);
    fromKey = fra ? mondayOf(fra) : defaultFrom;
    const parsed = Number.parseInt(params.uker ?? "", 10);
    weeks = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_WEEKS) : DEFAULT_WEEKS;
    toKey = addDays(fromKey, weeks * 7 - 1);
  } else {
    fromKey = fra ?? todayKey;
    toKey = addDays(fromKey, LIST_SPAN_DAYS - 1);
  }

  const EVENT_LIMIT = 1000;
  const events = await eventsInRange(fromKey, toKey, EVENT_LIMIT);
  if (events.length === EVENT_LIMIT) console.warn(`Kalender: nådde grensen på ${EVENT_LIMIT} hendelser (${fromKey}–${toKey})`);
  const atDefault = mode === "uker" ? !fra : fromKey === todayKey;
  const base = `/kalender?visning=${mode}`;

  return (
    <>
      <TopBar title="Kalender" action={<ViewToggle mode={mode} />} />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        <Card>
          <CardContent className="p-3">
            <TextImport people={people} variant="inline" />
          </CardContent>
        </Card>

        {mode === "uker" ? (
          <Link
            href={`${base}&fra=${addDays(fromKey, -MORE_WEEKS * 7)}&uker=${Math.min(weeks + MORE_WEEKS, MAX_WEEKS)}`}
            className={buttonClass("ghost", "sm", "-my-2 self-center text-[var(--color-muted)]")}
          >
            <ChevronUp className="h-4 w-4" aria-hidden /> Tidligere uker
          </Link>
        ) : null}

        <CalendarView
          mode={mode}
          events={events}
          people={people}
          fromKey={fromKey}
          toKey={toKey}
          weeks={weeks}
          todayKey={todayKey}
        />

        {mode === "uker" ? (
          <div className="flex flex-col items-center gap-1">
            {weeks < MAX_WEEKS ? (
              <Link
                href={`${base}${fra ? `&fra=${fromKey}` : ""}&uker=${Math.min(weeks + MORE_WEEKS, MAX_WEEKS)}`}
                scroll={false}
                className={buttonClass("outline", "default")}
              >
                <ChevronDown className="h-4 w-4" aria-hidden /> Vis flere uker
              </Link>
            ) : null}
          </div>
        ) : (
          <nav aria-label="Bla i kalenderen" className="flex items-center justify-between gap-2">
            <Link href={`${base}&fra=${addDays(fromKey, -LIST_SPAN_DAYS)}`} className={buttonClass("ghost", "sm")}>
              <ChevronLeft className="h-4 w-4" aria-hidden /> Tidligere
            </Link>
            <span className="text-xs text-[var(--color-muted)]">
              {formatDate(fromKey)} – {formatDate(toKey)}
            </span>
            <Link href={`${base}&fra=${addDays(toKey, 1)}`} className={buttonClass("ghost", "sm")}>
              Senere <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </nav>
        )}

        {!atDefault ? (
          <Link href={base} className="self-center text-sm text-[var(--color-primary)] underline">
            Til i dag
          </Link>
        ) : null}
      </main>
    </>
  );
}
