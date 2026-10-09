import Link from "next/link";
import { CalendarDays, ListChecks, MessageCircle, Pin, Plus, ShoppingCart } from "lucide-react";

import { PersonDots } from "@/components/person-dots";
import { TopBar } from "@/components/top-bar";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherCard } from "@/components/weather-card";
import { WEATHER_LOCATIONS, categoryMeta } from "@/lib/config";
import { buildAgenda, overlapFilter, rangeBounds } from "@/lib/events";
import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent, Message, Task } from "@/lib/types";
import { getForecast } from "@/lib/weather";
import { addDays, dayLabel, osloDateKey } from "@/lib/utils";

export const metadata = { title: "Hjem" };

function greeting(): string {
  const hour = Number(
    new Date().toLocaleString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hourCycle: "h23" })
  );
  if (hour < 5) return "God natt";
  if (hour < 10) return "God morgen";
  if (hour < 17) return "Hei";
  return "God kveld";
}

export default async function HomePage() {
  const [{ household, people, me }, supabase] = await Promise.all([getHousehold(), createClient()]);

  const todayKey = osloDateKey(new Date());
  const toKey = addDays(todayKey, 6);
  const { startIso, endIso } = rangeBounds(todayKey, toKey);

  const [events, pinned, tasks, shopping, ...forecasts] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("household_id", household.id)
      .lt("starts_at", endIso)
      .or(overlapFilter(startIso))
      .order("starts_at")
      .limit(200),
    supabase
      .from("messages")
      .select("*")
      .eq("household_id", household.id)
      .eq("important", true)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("tasks")
      .select("*")
      .eq("household_id", household.id)
      .eq("done", false)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50),
    supabase
      .from("shopping_items")
      .select("id", { count: "exact", head: true })
      .eq("household_id", household.id)
      .eq("status", "ma_kjopes"),
    ...WEATHER_LOCATIONS.map((l) => getForecast(l.lat, l.lng)),
  ]);

  const week = buildAgenda((events.data ?? []) as CalendarEvent[], todayKey, toKey);
  const openTasks = (tasks.data ?? []) as Task[];
  const dueSoon = openTasks.filter((t) => t.due_date && t.due_date <= addDays(todayKey, 2));
  const weatherRows = WEATHER_LOCATIONS.map((l, i) => ({ name: l.name, forecast: forecasts[i] ?? [] }));

  return (
    <>
      <TopBar title={`${greeting()}${me ? `, ${me.name}` : ""}`} />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        <WeatherCard rows={weatherRows} />

        {((pinned.data ?? []) as Message[]).map((m) => (
          <Link
            key={m.id}
            href="/beskjeder"
            className="flex items-start gap-2 rounded-xl border border-amber-300 bg-[var(--color-warning-bg)] p-3 text-sm"
          >
            <Pin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="line-clamp-3 whitespace-pre-wrap">{m.body}</span>
          </Link>
        ))}

        <div className="grid grid-cols-3 gap-2">
          <Stat href="/handleliste" icon={<ShoppingCart className="h-5 w-5" aria-hidden />} value={shopping.count ?? 0} label="å handle" />
          <Stat href="/gjoremal" icon={<ListChecks className="h-5 w-5" aria-hidden />} value={openTasks.length} label="gjøremål" />
          <Stat href="/beskjeder" icon={<MessageCircle className="h-5 w-5" aria-hidden />} value={(pinned.data ?? []).length} label="festet" />
        </div>

        {dueSoon.length > 0 ? (
          <Card>
            <CardContent className="p-3">
              <h2 className="mb-1 text-sm font-semibold">Frister snart</h2>
              <ul className="text-sm">
                {dueSoon.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 text-xs text-[var(--color-muted)]">{dayLabel(t.due_date!, todayKey)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <section aria-labelledby="uka" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 id="uka" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              <CalendarDays className="h-4 w-4" aria-hidden /> Neste sju dager
            </h2>
            <Link href="/kalender/ny" className={buttonClass("ghost", "sm", "text-[var(--color-primary)]")}>
              <Plus className="h-4 w-4" aria-hidden /> Ny
            </Link>
          </div>
          {week.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">Ingenting i kalenderen denne uka.</p>
          ) : (
            week.map((day) => (
              <Card key={day.dateKey}>
                <CardContent className="p-3">
                  <h3 className={day.dateKey === todayKey ? "text-sm font-semibold text-[var(--color-primary)]" : "text-sm font-semibold"}>
                    {dayLabel(day.dateKey, todayKey)}
                  </h3>
                  <ul className="mt-1 flex flex-col">
                    {day.entries.map(({ event, timeLabel }) => (
                      <li key={event.id}>
                        <Link href={`/kalender/${event.id}`} className="flex min-h-11 items-center gap-2 text-sm">
                          <span aria-hidden>{categoryMeta(event.category).emoji}</span>
                          <span className="w-24 shrink-0 text-xs tabular-nums text-[var(--color-muted)]">{timeLabel}</span>
                          <span className="min-w-0 flex-1 truncate">{event.title}</span>
                          <PersonDots people={people} ids={event.person_ids} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </main>
    </>
  );
}

function Stat({ href, icon, value, label }: { href: string; icon: React.ReactNode; value: number; label: string }) {
  return (
    <Link href={href}>
      <Card className="h-full">
        <CardContent className="flex flex-col items-center gap-0.5 p-3">
          <span className="text-[var(--color-primary)]">{icon}</span>
          <span className="text-xl font-bold tabular-nums">{value}</span>
          <span className="text-xs text-[var(--color-muted)]">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
