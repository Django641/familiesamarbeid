"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

import { PersonPicker } from "@/components/person-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_CATEGORIES } from "@/lib/config";
import { type EventDraft, type EventRowDraft, draftToRow } from "@/lib/event-draft";
import type { CalendarEvent, Person } from "@/lib/types";
import { addDays } from "@/lib/utils";

import { createEvents, deleteEvent, updateEvent } from "./actions";

type Repeat = "none" | "weekly" | "biweekly";

export function EventForm({
  people,
  initial,
  event,
}: {
  people: Person[];
  initial: EventDraft;
  /** Satt når vi redigerer en eksisterende hendelse. */
  event?: CalendarEvent;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [repeatUntil, setRepeatUntil] = useState(addDays(initial.date, 7 * 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      // Flytt sluttdato med når startdato flyttes forbi den.
      if (key === "date" && (!prev.endDate || prev.endDate < (value as string))) next.endDate = value as string;
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const result = draftToRow(draft);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = event
        ? await updateEvent(event.id, result.row)
        : await createEvents(expandRepeat(result.row, draft, repeat, repeatUntil));
      if (res.error) {
        setError(res.error);
        setBusy(false);
        return;
      }
    } catch {
      setError("Klarte ikke å lagre. Prøv igjen.");
      setBusy(false);
      return;
    }
    router.push("/kalender");
  }

  async function remove(wholeSeries: boolean) {
    if (!event) return;
    const question = wholeSeries ? "Slette alle hendelsene i serien?" : "Slette hendelsen?";
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      await deleteEvent(event.id, wholeSeries);
    } catch {
      setError("Klarte ikke å slette. Prøv igjen.");
      setBusy(false);
      return;
    }
    router.push("/kalender");
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Hva skjer?</Label>
        <Input
          id="title"
          autoFocus={!event}
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="F.eks. Foreldremøte, Fotballkamp, Jobbreise Bergen"
          enterKeyHint="next"
        />
      </div>

      <PersonPicker people={people} value={draft.personIds} onChange={(ids) => set("personIds", ids)} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="category">Type</Label>
        <Select id="category" value={draft.category} onChange={(e) => set("category", e.target.value)}>
          {EVENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.emoji} {c.label}
            </option>
          ))}
        </Select>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--color-primary)]"
          checked={draft.allDay}
          onChange={(e) => set("allDay", e.target.checked)}
        />
        Hele dagen
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="date">Dato</Label>
          <Input id="date" type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} />
        </div>
        {!draft.allDay ? (
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="start-time">Fra</Label>
            <Input
              id="start-time"
              type="time"
              value={draft.startTime}
              onChange={(e) => set("startTime", e.target.value)}
            />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="end-date">Til dato</Label>
          <Input
            id="end-date"
            type="date"
            min={draft.date}
            value={draft.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </div>
        {!draft.allDay ? (
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="end-time">Til (valgfritt)</Label>
            <Input id="end-time" type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Sted (valgfritt)</Label>
        <Input id="location" value={draft.location} onChange={(e) => set("location", e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Notat (valgfritt)</Label>
        <Textarea
          id="description"
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Hvem henter? Hva må med?"
        />
      </div>

      {!event ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="repeat">Gjenta</Label>
            <Select id="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
              <option value="none">Ikke</option>
              <option value="weekly">Hver uke</option>
              <option value="biweekly">Annenhver uke</option>
            </Select>
          </div>
          {repeat !== "none" ? (
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="repeat-until">Til og med</Label>
              <Input
                id="repeat-until"
                type="date"
                min={draft.date}
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Lagrer …" : event ? "Lagre endringer" : "Legg i kalenderen"}
      </Button>

      {event ? (
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => remove(false)}>
            <Trash2 className="h-4 w-4" aria-hidden /> Slett hendelsen
          </Button>
          {event.series_id ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => remove(true)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Slett hele serien
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

/** Lager kopier for «gjenta hver uke/annenhver uke» (maks 60). Alle får samme series_id. */
function expandRepeat(row: EventRowDraft, draft: EventDraft, repeat: Repeat, until: string): EventRowDraft[] {
  if (repeat === "none" || !until || until <= draft.date) return [row];
  const step = repeat === "weekly" ? 7 : 14;
  const seriesId = crypto.randomUUID();
  const rows: EventRowDraft[] = [];
  for (let offset = 0, i = 0; addDays(draft.date, offset) <= until && i < 60; offset += step, i++) {
    const shifted = draftToRow({
      ...draft,
      date: addDays(draft.date, offset),
      endDate: addDays(draft.endDate || draft.date, offset),
    });
    if ("row" in shifted) rows.push({ ...shifted.row, series_id: seriesId });
  }
  return rows;
}
