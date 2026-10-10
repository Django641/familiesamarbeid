"use client";

import { PersonPicker } from "@/components/person-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EVENT_CATEGORIES } from "@/lib/config";
import type { Person } from "@/lib/types";

import { RepeatPicker } from "../repeat-picker";
import type { Row } from "./ai-draft";

/** AI-forslagene som redigerbare kort, med Lagre og Tilbake. Ingenting lagres før brukeren trykker Lagre. */
export function DraftReview({
  rows,
  people,
  busy,
  error,
  inline,
  onUpdate,
  onSave,
  onBack,
}: {
  rows: Row[];
  people: Person[];
  busy: boolean;
  error: string | null;
  inline: boolean;
  onUpdate: (key: string, changes: Partial<Row>) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const count = rows.filter((r) => r.selected).length;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <Card key={r.key} className={r.selected ? "" : "opacity-60"}>
          <CardContent className="flex flex-col gap-3 p-3">
            {rows.length > 1 ? (
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-primary)]"
                  checked={r.selected}
                  onChange={(e) => onUpdate(r.key, { selected: e.target.checked })}
                />
                Ta med
              </label>
            ) : null}
            <Input aria-label="Tittel" value={r.title} onChange={(e) => onUpdate(r.key, { title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="Dato"
                type="date"
                value={r.date}
                onChange={(e) => onUpdate(r.key, { date: e.target.value, endDate: e.target.value > r.endDate ? e.target.value : r.endDate })}
              />
              {r.allDay ? (
                <span className="flex items-center text-sm text-[var(--color-muted)]">Hele dagen</span>
              ) : (
                <Input
                  aria-label="Klokkeslett"
                  type="time"
                  value={r.startTime}
                  onChange={(e) => onUpdate(r.key, { startTime: e.target.value })}
                />
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`cat-${r.key}`} className="sr-only">
                Type
              </Label>
              <Select id={`cat-${r.key}`} value={r.category} onChange={(e) => onUpdate(r.key, { category: e.target.value })}>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <PersonPicker
              people={people}
              value={r.personIds}
              onChange={(ids) => onUpdate(r.key, { personIds: ids })}
              label="Gjelder"
            />
            <RepeatPicker
              id={`repeat-${r.key}`}
              draft={r}
              repeat={r.repeat}
              until={r.repeatUntil}
              onChange={(repeat, repeatUntil) => onUpdate(r.key, { repeat, repeatUntil })}
            />
            {r.location ? <p className="text-xs text-[var(--color-muted)]">📍 {r.location}</p> : null}
            {r.description ? <p className="text-xs text-[var(--color-muted)]">{r.description}</p> : null}
          </CardContent>
        </Card>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <Button size="lg" onClick={onSave} disabled={busy || count === 0}>
        {busy ? "Lagrer …" : `Lagre ${count} i kalenderen`}
      </Button>
      <Button variant="outline" onClick={onBack} disabled={busy}>
        {inline ? "Tilbake til teksten" : "Start på nytt"}
      </Button>
    </div>
  );
}
