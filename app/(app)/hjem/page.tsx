import Link from "next/link";
import { CalendarDays, ListChecks, MessageCircle, Pin, Plus, ShoppingCart } from "lucide-react";

import { PersonDots } from "@/components/person-dots";
import { TopBar } from "@/components/top-bar";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherCard } from "@/components/weather-card";
import { WEATHER_LOCATIONS, categoryMeta } from "@/lib/config";
import { and, asc, count, desc, eq, isNotNull, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { messages, shopping_items, tasks } from "@/lib/db/schema";
import { buildAgenda } from "@/lib/events";
import { eventsInRange } from "@/lib/events-db";
import { getFamily } from "@/lib/session";
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
  const { people, me } = await getFamily();
  const todayKey = osloDateKey(new Date());
  const toKey = addDays(todayKey, 6);

  const [events, pinned, dueSoon, [{ value: openTasks }], [{ value: toBuy }], ...forecasts] = await Promise.all([
    eventsInRange(todayKey, toKey, 200),
    db.select().from(messages).where(eq(messages.pinned, true)).orderBy(desc(messages.created_at)).limit(5),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.done, false), isNotNull(tasks.due_date), lte(tasks.due_date, addDays(todayKey, 2))))
      .orderBy(asc(tasks.due_date))
      .limit(10),
    db.select({ value: count() }).from(tasks).where(eq(tasks.done, false)),
    db.select({ value: count() }).from(shopping_items).where(eq(shopping_items.status, "ma_kjopes")),
    ...WEATHER_LOCATIONS.map((l) => getForecast(l.lat, l.lng)),
  ]);

  const week = buildAgenda(events, todayKey, toKey);
  const weatherRows = WEATHER_LOCATIONS.map((l, i) => ({ name: l.name, forecast: forecasts[i] ?? [] }));

  return (
    <>
      <TopBar title={`${greeting()}, ${me.name}`} />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        <WeatherCard rows={weatherRows} />

        {pinned.map((m) => (
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
          <Stat href="/handleliste" icon={<ShoppingCart className="h-5 w-5" aria-hidden />} value={toBuy} label="å handle" />
          <Stat href="/gjoremal" icon={<ListChecks className="h-5 w-5" aria-hidden />} value={openTasks} label="gjøremål" />
          <Stat href="/beskjeder" icon={<MessageCircle className="h-5 w-5" aria-hidden />} value={pinned.length} label="festet" />
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
