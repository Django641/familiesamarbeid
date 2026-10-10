"use client";

import { Repeat as RepeatIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { type EventDraft, type Repeat, defaultRepeatUntil, repeatSummary } from "@/lib/event-draft";

const OPTIONS = [
  { value: "weekly", label: "Hver uke" },
  { value: "biweekly", label: "Annenhver uke" },
] as const;

/** Avkrysning «Gjentas hver uke» + hyppighet og «til og med». Brukes i skjemaet og på AI-forslagene. */
export function RepeatPicker({
  id,
  draft,
  repeat,
  until,
  onChange,
}: {
  id: string;
  draft: Pick<EventDraft, "date" | "allDay" | "startTime">;
  repeat: Repeat;
  until: string;
  onChange: (repeat: Repeat, until: string) => void;
}) {
  const on = repeat !== "none";
  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--color-primary)]"
          checked={on}
          onChange={(e) =>
            onChange(
              e.target.checked ? "weekly" : "none",
              // Forslaget følger startdatoen hvis den er flyttet forbi «til og med».
              e.target.checked && (!until || until <= draft.date) ? defaultRepeatUntil(draft.date) : until
            )
          }
        />
        Gjentas hver uke
      </label>
      {on ? (
        <div className="flex flex-col gap-3 border-l-2 border-[var(--color-border)] pl-3">
          <Segmented
            label="Hvor ofte"
            value={repeat as "weekly" | "biweekly"}
            onChange={(r) => onChange(r, until)}
            options={OPTIONS}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-until`}>Til og med</Label>
            <Input
              id={`${id}-until`}
              type="date"
              min={draft.date}
              value={until}
              onChange={(e) => onChange(repeat, e.target.value)}
            />
          </div>
          <p className="flex items-start gap-2 text-sm text-[var(--color-muted)]" aria-live="polite">
            <RepeatIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {repeatSummary(draft, repeat, until)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
