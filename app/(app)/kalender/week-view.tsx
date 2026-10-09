"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { categoryMeta } from "@/lib/config";
import { type AgendaEntry, buildAgenda } from "@/lib/events";
import type { CalendarEvent, Person } from "@/lib/types";
import { MAX_DAY_MARKS, type WeekBar, type WeekLayout, layoutWeek, prepareEvents } from "@/lib/week-layout";
import { addDays, cn, dayLabel, formatDate } from "@/lib/utils";

import { EventRow } from "./event-row";

const WEEKDAYS = ["ma", "ti", "on", "to", "fr", "lø", "sø"];

function monthTitle(dateKey: string) {
  const s = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("nb-NO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function longDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** «Uker»: én rad per uke, reiser/heldag som stolper, resten som små merker. Trykk på en dag → dagsark. */
export function WeekView({
  events,
  people,
  fromKey,
  weeks,
  todayKey,
}: {
  events: CalendarEvent[];
  people: Person[];
  /** Mandagen i første uke. */
  fromKey: string;
  weeks: number;
  todayKey: string;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const toKey = addDays(fromKey, weeks * 7 - 1);

  const layouts = useMemo(() => {
    const prepared = prepareEvents(events); // datonøkler regnes ut én gang per hendelse
    return Array.from({ length: weeks }, (_, i) => layoutWeek(prepared, addDays(fromKey, i * 7), people));
  }, [events, fromKey, weeks, people]);
  const agendaByDay = useMemo(
    () => new Map(buildAgenda(events, fromKey, toKey).map((d) => [d.dateKey, d.entries])),
    [events, fromKey, toKey]
  );
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  return (
    <div>
      <div
        aria-hidden
        className="grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] pb-1 text-center text-xs font-medium text-[var(--color-muted)]"
      >
        <span />
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        {layouts.map((week, i) => {
          const firstOfMonth = week.days.find((d) => d.dateKey.endsWith("-01"));
          const heading = i === 0 ? monthTitle(week.days[3].dateKey) : firstOfMonth ? monthTitle(firstOfMonth.dateKey) : null;
          return (
            <section key={week.mondayKey} aria-label={`Uke ${week.weekNumber}, ${formatDate(week.mondayKey)}–${formatDate(week.days[6].dateKey)}`}>
              {heading ? (
                <h2 className="border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm font-semibold">
                  {heading}
                </h2>
              ) : null}
              <WeekRow
                week={week}
                todayKey={todayKey}
                agendaByDay={agendaByDay}
                personById={personById}
                onOpenDay={setOpenDay}
              />
            </section>
          );
        })}
      </div>

      <Sheet open={openDay !== null} onClose={() => setOpenDay(null)} title={openDay ? dayLabel(openDay, todayKey) : ""}>
        {openDay ? (
          <div className="flex flex-col gap-3">
            {(agendaByDay.get(openDay) ?? []).length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Ingenting denne dagen.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {agendaByDay.get(openDay)!.map((entry) => (
                  <li key={entry.event.id}>
                    <EventRow entry={entry} people={people} />
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/kalender/ny?dato=${openDay}`}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 font-medium text-[var(--color-primary-foreground)]"
            >
              <Plus className="h-5 w-5" aria-hidden /> Ny hendelse {formatDate(openDay)}
            </Link>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

function WeekRow({
  week,
  todayKey,
  agendaByDay,
  personById,
  onOpenDay,
}: {
  week: WeekLayout;
  todayKey: string;
  agendaByDay: Map<string, AgendaEntry[]>;
  personById: Map<string, Person>;
  onOpenDay: (dateKey: string) => void;
}) {
  const lanes = week.bars.reduce((max, b) => Math.max(max, b.lane + 1), 0);
  const marksRow = lanes + 2;

  return (
    <div
      className="relative grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] border-b border-[var(--color-border)] last:border-b-0"
      style={{
        // repeat(0, …) er ugyldig CSS — uker uten stolper får bare dagtall + merker.
        gridTemplateRows:
          lanes > 0 ? `1.75rem repeat(${lanes}, 1.25rem) minmax(1.75rem, auto)` : "1.75rem minmax(1.75rem, auto)",
      }}
    >
      <span
        aria-hidden
        className="flex items-start justify-center pt-1.5 text-[11px] tabular-nums text-[var(--color-muted)]"
        style={{ gridColumn: 1, gridRow: "1 / -1" }}
      >
        {week.weekNumber}
      </span>

      {/* Dagknappene ligger under alt annet og dekker hele cellen. */}
      {week.days.map((day, col) => {
        const entries = agendaByDay.get(day.dateKey) ?? [];
        const isToday = day.dateKey === todayKey;
        const label = [
          longDate(day.dateKey),
          `uke ${week.weekNumber}`,
          isToday ? "i dag" : null,
          entries.length === 0
            ? "ingen hendelser"
            : entries.map((e) => (e.timeLabel === "Hele dagen" ? e.event.title : `${e.event.title} ${e.timeLabel}`)).join(", "),
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <button
            key={day.dateKey}
            type="button"
            onClick={() => onOpenDay(day.dateKey)}
            aria-label={label}
            className={cn(
              "min-h-16 border-l border-[var(--color-border)] text-left focus-visible:z-20",
              col >= 5 && "bg-[var(--color-bg)]/60"
            )}
            style={{ gridColumn: col + 2, gridRow: "1 / -1" }}
          />
        );
      })}

      {week.days.map((day, col) => {
        const isToday = day.dateKey === todayKey;
        const isPast = day.dateKey < todayKey;
        const busy = day.total >= 4;
        return (
          <span
            key={`n-${day.dateKey}`}
            aria-hidden
            className="pointer-events-none z-10 flex items-start justify-center pt-1"
            style={{ gridColumn: col + 2, gridRow: 1 }}
          >
            <span
              className={cn(
                "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] tabular-nums",
                isToday && "bg-[var(--color-primary)] font-semibold text-[var(--color-primary-foreground)]",
                !isToday && isPast && "text-[var(--color-muted)]",
                !isToday && busy && "font-bold"
              )}
            >
              {Number(day.dateKey.slice(8))}
            </span>
          </span>
        );
      })}

      {week.bars.map((bar) => (
        <Bar key={`${bar.event.id}-${week.mondayKey}`} bar={bar} personById={personById} />
      ))}

      {week.days.map((day, col) => {
        const shown = day.marks.slice(0, MAX_DAY_MARKS);
        const more = day.marks.length - shown.length + day.hiddenBars;
        if (shown.length === 0 && more === 0) return null;
        return (
          <span
            key={`m-${day.dateKey}`}
            aria-hidden
            className="pointer-events-none z-10 flex flex-wrap content-start items-start justify-center gap-x-0.5 px-0.5 pt-0.5 pb-1"
            style={{ gridColumn: col + 2, gridRow: marksRow }}
          >
            {shown.map(({ event }) => {
              const color = personById.get(event.person_ids[0] ?? "")?.color;
              return (
                <span
                  key={event.id}
                  className="flex flex-col items-center text-[15px] leading-5"
                  title={event.title}
                >
                  {categoryMeta(event.category).emoji}
                  <span
                    className="h-0.5 w-3 rounded-full"
                    style={{ backgroundColor: color ?? "var(--color-border)" }}
                  />
                </span>
              );
            })}
            {more > 0 ? <span className="text-[11px] leading-5 text-[var(--color-muted)]">+{more}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

function Bar({ bar, personById }: { bar: WeekBar; personById: Map<string, Person> }) {
  const persons = bar.event.person_ids.map((id) => personById.get(id)).filter((p): p is Person => Boolean(p));
  const solo = persons.length === 1 ? persons[0] : null;
  const initials = persons.map((p) => p.name.slice(0, 1).toUpperCase()).join("");
  const emoji = categoryMeta(bar.event.category).emoji;
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none z-10 my-px flex min-w-0 items-center gap-1 overflow-hidden px-1 text-[11px] leading-none font-medium whitespace-nowrap",
        bar.continuesLeft ? "ml-0 rounded-l-none" : "ml-0.5 rounded-l-md",
        bar.continuesRight ? "mr-0 rounded-r-none" : "mr-0.5 rounded-r-md",
        solo ? "text-white" : "border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
      )}
      style={{
        gridColumn: `${bar.startCol + 2} / ${bar.endCol + 3}`,
        gridRow: bar.lane + 2,
        backgroundColor: solo?.color,
      }}
    >
      {bar.continuesLeft ? <span>◂</span> : null}
      <span>{emoji}</span>
      {/* På én dag (~48 px) er det bare plass til emoji + starten av tittelen; fargen viser hvem. */}
      {initials && bar.endCol > bar.startCol ? <span className="font-bold">{initials}</span> : null}
      <span className="min-w-0 truncate">{bar.event.title}</span>
    </span>
  );
}
