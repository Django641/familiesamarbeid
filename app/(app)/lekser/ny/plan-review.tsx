"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { recheckRow, shiftHomeworkDates, weekdayShort, weekLabel } from "@/lib/homework";
import type { CalendarEvent, Person } from "@/lib/types";
import { addDays, cn, dayLabel } from "@/lib/utils";
import { moveRow, PLAN_GROUPS, type PlanGroup, type PlanRow, saveLabel, selectedCounts } from "@/lib/weekly-plan-draft";

/** Ett barns ukeplan i godkjenningsarket. */
export type ReviewGroup = {
  personId: string;
  weekStart: string;
  weekGuessed: boolean;
  rows: PlanRow[];
  explanation: string;
  /** Originalene i Blob (registreres som dokumenter når uka lagres). */
  paths: string[];
};

const GROUP_TITLE: Record<PlanGroup, string> = { kalender: "Til kalenderen", lekse: "Lekser", mal: "Mål" };
const GROUP_BADGE: Record<PlanGroup, string> = { kalender: "Kalender", lekse: "Lekse", mal: "Mål" };

const chipClass = (active: boolean) =>
  cn(
    "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
    active
      ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
      : "border-[var(--color-border)] bg-[var(--color-surface)]"
  );

function subtitle(r: PlanRow): string {
  if (r.group === "mal") return "";
  if (r.group === "lekse") return r.date ? `Til ${dayLabel(r.date).toLowerCase()}` : "Hele uka";
  if (!r.date) return "Velg dato";
  const when = r.allDay ? "Hele dagen" : `${r.startTime}${r.endTime ? `–${r.endTime}` : ""}`;
  return `${dayLabel(r.date)} · ${when}`;
}

export function PlanReview({
  group,
  kids,
  events,
  today,
  position,
  busy,
  error,
  notice,
  onChange,
  onSave,
  onSkip,
  onCancel,
}: {
  group: ReviewGroup;
  kids: Person[];
  events: CalendarEvent[];
  today: string;
  /** Plass i rekka når flere barn lastes opp samtidig. */
  position: { index: number; total: number; nextName: string | null };
  busy: boolean;
  error: string | null;
  notice: string | null;
  onChange: (next: ReviewGroup) => void;
  onSave: () => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const [editKey, setEditKey] = useState<string | null>(null);
  const editing = group.rows.find((r) => r.key === editKey) ?? null;
  const counts = selectedCounts(group.rows);
  const nothing = counts.calendar + counts.homework + counts.goals === 0;

  const setRows = (rows: PlanRow[]) => onChange({ ...group, rows });
  const updateRow = (key: string, next: PlanRow) => setRows(group.rows.map((r) => (r.key === key ? next : r)));

  function setChild(personId: string) {
    onChange({ ...group, personId, rows: group.rows.map((r) => recheckRow(r, events, personId, today)) });
  }

  function setWeek(delta: number) {
    onChange({
      ...group,
      weekStart: addDays(group.weekStart, delta),
      weekGuessed: false,
      rows: shiftHomeworkDates(group.rows, delta),
    });
  }

  function edit(row: PlanRow, changes: Partial<PlanRow>) {
    updateRow(row.key, recheckRow({ ...row, ...changes }, events, group.personId, today));
  }

  return (
    <div className="flex flex-col gap-4">
      {position.total > 1 ? (
        <p className="text-sm font-medium text-[var(--color-muted)]">
          Ukeplan {position.index + 1} av {position.total}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl bg-[var(--color-warning-bg)] px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      <div role="group" aria-label="Gjelder" className="flex flex-col gap-2">
        <span className="text-sm font-medium">Gjelder</span>
        <div className="flex flex-wrap gap-2">
          {kids.map((k) => (
            <button key={k.id} type="button" aria-pressed={group.personId === k.id} onClick={() => setChild(k.id)} className={chipClass(group.personId === k.id)}>
              {k.name}
            </button>
          ))}
        </div>
        {group.personId === "" ? <p className="text-sm text-[var(--color-muted)]">Fant ikke hvem planen gjelder. Velg barnet.</p> : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setWeek(-7)}
          aria-label="Forrige uke"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-lg"
        >
          ‹
        </button>
        <div className="text-center">
          <p className="font-semibold">{weekLabel(group.weekStart)}</p>
          {group.weekGuessed ? <p className="text-xs text-[var(--color-muted)]">Fant ikke uka i planen. Sjekk at den stemmer.</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setWeek(7)}
          aria-label="Neste uke"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-lg"
        >
          ›
        </button>
      </div>

      {group.explanation ? <p className="text-sm text-[var(--color-muted)]">{group.explanation}</p> : null}
      {group.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">
          Fant ingenting å legge inn i denne planen.
        </p>
      ) : null}

      {PLAN_GROUPS.map((g) => {
        const rows = group.rows.filter((r) => r.group === g);
        if (rows.length === 0) return null;
        return (
          <section key={g} aria-label={GROUP_TITLE[g]} className="flex flex-col gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {GROUP_TITLE[g]} <span className="font-normal opacity-70">· {rows.length}</span>
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
              {rows.map((r) => (
                <li key={r.key} className="flex items-center gap-1 border-b border-[var(--color-border)] pr-3 last:border-b-0">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={r.selected}
                    aria-label={`Ta med «${r.text}»`}
                    onClick={() => updateRow(r.key, { ...r, selected: !r.selected, userSelected: true })}
                    className="flex h-14 w-14 shrink-0 items-center justify-center"
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
                        r.selected ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "border-[var(--color-border)]"
                      )}
                    >
                      {r.selected ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : null}
                    </span>
                  </button>
                  <button type="button" onClick={() => setEditKey(r.key)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left">
                    <span className={cn("min-w-0 flex-1", !r.selected && "text-[var(--color-muted)]")}>
                      <span className="block break-words">{r.text}</span>
                      {subtitle(r) ? <span className="block text-xs text-[var(--color-muted)]">{subtitle(r)}</span> : null}
                      {r.duplicate ? <span className="block text-xs font-medium text-[var(--color-muted)]">Finnes alt i kalenderen</span> : null}
                      {r.past && !r.duplicate ? <span className="block text-xs font-medium text-[var(--color-muted)]">Datoen er passert</span> : null}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--color-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)]">{GROUP_BADGE[r.group]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={onSave} disabled={busy || nothing || group.personId === ""}>
          {busy ? "Lagrer …" : saveLabel(group.rows)}
        </Button>
        {position.nextName ? (
          <Button variant="outline" onClick={onSkip} disabled={busy}>
            Hopp over · Neste: {position.nextName} ›
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Avbryt
        </Button>
      </div>

      <Sheet open={editing !== null} onClose={() => setEditKey(null)} title="Rediger rad">
        {editing ? (
          <RowForm
            row={editing}
            weekStart={group.weekStart}
            onEdit={(changes) => edit(editing, changes)}
            onMove={(g) => updateRow(editing.key, recheckRow(moveRow(editing, g, group.weekStart), events, group.personId, today))}
            onClose={() => setEditKey(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function RowForm({
  row,
  weekStart,
  onEdit,
  onMove,
  onClose,
}: {
  row: PlanRow;
  weekStart: string;
  onEdit: (changes: Partial<PlanRow>) => void;
  onMove: (g: PlanGroup) => void;
  onClose: () => void;
}) {
  const days = [0, 1, 2, 3, 4].map((n) => addDays(weekStart, n));
  const extra = row.date && !days.includes(row.date) ? [row.date] : [];
  return (
    <div className="flex flex-col gap-4">
      <Input aria-label="Tekst" value={row.text} onChange={(e) => onEdit({ text: e.target.value })} maxLength={row.group === "kalender" ? 200 : 300} />

      <div role="group" aria-label="Hvor?" className="flex flex-col gap-2">
        <span className="text-sm font-medium">Hvor?</span>
        <div className="flex gap-2">
          {PLAN_GROUPS.map((g) => (
            <button key={g} type="button" aria-pressed={row.group === g} onClick={() => onMove(g)} className={cn(chipClass(row.group === g), "flex-1 justify-center")}>
              {GROUP_BADGE[g]}
            </button>
          ))}
        </div>
      </div>

      {row.group === "lekse" ? (
        <div role="group" aria-label="Ferdig til" className="-mx-5 flex gap-2 overflow-x-auto px-5">
          <button type="button" aria-pressed={row.date === ""} onClick={() => onEdit({ date: "" })} className={chipClass(row.date === "")}>
            Hele uka
          </button>
          {[...days, ...extra].map((d) => (
            <button key={d} type="button" aria-pressed={row.date === d} aria-label={dayLabel(d)} onClick={() => onEdit({ date: d })} className={chipClass(row.date === d)}>
              {weekdayShort(d)}
            </button>
          ))}
        </div>
      ) : null}

      {row.group === "kalender" ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Dato
            <Input type="date" value={row.date} onChange={(e) => onEdit({ date: e.target.value })} />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--color-primary)]"
              checked={row.allDay}
              onChange={(e) => onEdit({ allDay: e.target.checked, ...(e.target.checked ? { startTime: "", endTime: "" } : {}) })}
            />
            Hele dagen
          </label>
          {row.allDay ? null : (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Fra
                <Input type="time" value={row.startTime} onChange={(e) => onEdit({ startTime: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Til
                <Input type="time" value={row.endTime} onChange={(e) => onEdit({ endTime: e.target.value })} />
              </label>
            </div>
          )}
        </div>
      ) : null}

      <Button size="lg" onClick={onClose}>
        Ferdig
      </Button>
    </div>
  );
}
