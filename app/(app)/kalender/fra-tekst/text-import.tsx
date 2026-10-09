"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { PersonPicker } from "@/components/person-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_CATEGORIES } from "@/lib/config";
import { type EventDraft, draftToRow } from "@/lib/event-draft";
import { notifyHousehold } from "@/lib/push-client";
import { createClient } from "@/lib/supabase/client";
import type { Person } from "@/lib/types";

type AiEvent = {
  title: string;
  date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  all_day: boolean;
  location: string;
  category: string;
  people: string[];
  notes: string;
};

type Row = EventDraft & { key: string; selected: boolean };

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toRow(e: AiEvent, people: Person[], i: number): Row {
  const names = e.people.map((n) => n.toLowerCase());
  const allDay = e.all_day || !TIME_RE.test(e.start_time);
  return {
    key: `${i}-${e.title}`,
    selected: true,
    title: e.title,
    category: EVENT_CATEGORIES.some((c) => c.value === e.category) ? e.category : "annet",
    allDay,
    date: DATE_RE.test(e.date) ? e.date : "",
    startTime: allDay ? "" : e.start_time,
    endDate: DATE_RE.test(e.end_date) ? e.end_date : e.date,
    endTime: !allDay && TIME_RE.test(e.end_time) ? e.end_time : "",
    location: e.location,
    description: e.notes,
    personIds: people.filter((p) => names.includes(p.name.toLowerCase())).map((p) => p.id),
  };
}

export function TextImport({ householdId, people }: { householdId: string; people: Person[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyse() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/parse-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { events?: AiEvent[]; error?: string };
      if (!res.ok || !data.events) throw new Error(data.error ?? "Noe gikk galt");
      if (data.events.length === 0) setError("Fant ingen hendelser med dato i teksten.");
      setRows(data.events.map((e, i) => toRow(e, people, i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noe gikk galt");
    } finally {
      setBusy(false);
    }
  }

  function update(key: string, changes: Partial<Row>) {
    setRows((prev) => prev?.map((r) => (r.key === key ? { ...r, ...changes } : r)) ?? null);
  }

  async function save() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.selected);
    const converted = chosen.map((r) => draftToRow(r));
    const bad = converted.findIndex((c) => "error" in c);
    if (bad >= 0) {
      const err = converted[bad] as { error: string };
      setError(`«${chosen[bad].title || "Uten tittel"}»: ${err.error}`);
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("events")
      .insert(converted.map((c) => ({ ...(c as { row: Record<string, unknown> }).row, household_id: householdId })));
    setBusy(false);
    if (dbError) {
      setError("Klarte ikke å lagre. Prøv igjen.");
      return;
    }
    notifyHousehold(
      chosen.length === 1 ? `la inn «${chosen[0].title}» i kalenderen` : `la inn ${chosen.length} hendelser i kalenderen`,
      "/kalender",
      "calendar"
    );
    router.push("/kalender");
    router.refresh();
  }

  if (rows && rows.length > 0) {
    const count = rows.filter((r) => r.selected).length;
    return (
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <Card key={r.key} className={r.selected ? "" : "opacity-60"}>
            <CardContent className="flex flex-col gap-3 p-3">
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-primary)]"
                  checked={r.selected}
                  onChange={(e) => update(r.key, { selected: e.target.checked })}
                />
                Ta med
              </label>
              <Input aria-label="Tittel" value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  aria-label="Dato"
                  type="date"
                  value={r.date}
                  onChange={(e) => update(r.key, { date: e.target.value, endDate: e.target.value > r.endDate ? e.target.value : r.endDate })}
                />
                {r.allDay ? (
                  <span className="flex items-center text-sm text-[var(--color-muted)]">Hele dagen</span>
                ) : (
                  <Input
                    aria-label="Klokkeslett"
                    type="time"
                    value={r.startTime}
                    onChange={(e) => update(r.key, { startTime: e.target.value })}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`cat-${r.key}`} className="sr-only">
                  Type
                </Label>
                <Select id={`cat-${r.key}`} value={r.category} onChange={(e) => update(r.key, { category: e.target.value })}>
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
                onChange={(ids) => update(r.key, { personIds: ids })}
                label="Gjelder"
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
        <Button size="lg" onClick={save} disabled={busy || count === 0}>
          {busy ? "Lagrer …" : `Lagre ${count} i kalenderen`}
        </Button>
        <Button variant="outline" onClick={() => setRows(null)} disabled={busy}>
          Start på nytt
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor="paste" className="sr-only">
        Tekst
      </Label>
      <Textarea
        id="paste"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="F.eks.: «Hei! Foreldremøte for 4B tirsdag 21. oktober kl. 18 i aulaen. Husk å svare på Spond om dugnad lørdag.»"
      />
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <Button size="lg" onClick={analyse} disabled={busy || text.trim().length < 3}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Sparkles className="h-5 w-5" aria-hidden />}
        {busy ? "Leser teksten …" : "Finn hendelser"}
      </Button>
    </div>
  );
}
