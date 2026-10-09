"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ClipboardPaste, ImagePlus, Loader2, Sparkles } from "lucide-react";

import { PersonPicker } from "@/components/person-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_CATEGORIES } from "@/lib/config";
import { type EventDraft, type EventRowDraft, draftToRow } from "@/lib/event-draft";
import { prepareUpload } from "@/lib/prepare-upload";
import type { Person } from "@/lib/types";

import { createEvents } from "../actions";

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

/**
 * Skriv eller lim inn tekst → AI foreslår hendelser → brukeren retter og lagrer.
 * `inline` er hurtigfeltet øverst i Kalender; `page` er egen side (brukes fra Beskjeder).
 * AI-forslag lagres aldri uten at de er vist og bekreftet.
 */
export function TextImport({
  people,
  initialText = "",
  variant = "page",
}: {
  people: Person[];
  initialText?: string;
  variant?: "page" | "inline";
}) {
  const router = useRouter();
  const inline = variant === "inline";
  const [text, setText] = useState(initialText);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const [reading, setReading] = useState<"tekst" | "fil">("tekst");
  const fileInput = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanPaste(typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function");
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  async function paste() {
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (clip) setText((prev) => (prev.trim() ? `${prev.trim()}\n${clip}` : clip).slice(0, 8000));
    } catch {
      setError("Fikk ikke lest utklippstavla. Hold fingeren i feltet og velg «Lim inn».");
    }
  }

  async function run(init: RequestInit, kind: "tekst" | "fil") {
    setBusy(true);
    setReading(kind);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/ai/parse-events", { method: "POST", ...init });
      const data = (await res.json().catch(() => ({}))) as { events?: AiEvent[]; error?: string };
      if (!res.ok || !data.events) {
        const fallback =
          res.status === 413
            ? "Fila er for stor."
            : res.status === 504
              ? "Det tok for lang tid. Prøv et skjermbilde av siden med datoene."
              : "Noe gikk galt";
        throw new Error(data.error ?? fallback);
      }
      if (data.events.length === 0) {
        setError(kind === "fil" ? "Fant ingen hendelser med dato i fila." : "Fant ingen hendelser med dato i teksten.");
      }
      setRows(data.events.map((e, i) => toRow(e, people, i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noe gikk galt");
    } finally {
      setBusy(false);
    }
  }

  function analyse() {
    return run({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }, "tekst");
  }

  /** Bilde/PDF → AI. Det som står i tekstfeltet sendes med som kommentar («gjelder Lea»). */
  async function analyseFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = ""; // samme fil kan velges igjen
    if (!file || busy) return;
    setBusy(true); // konvertering av store bilder kan ta et par sekunder på telefonen
    setReading("fil");
    setError(null);
    let upload: File;
    try {
      upload = await prepareUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klarte ikke å lese fila.");
      setBusy(false);
      return;
    }
    const form = new FormData();
    form.append("fil", upload);
    if (text.trim()) form.append("tekst", text.trim().slice(0, 2000));
    await run({ body: form }, "fil");
  }

  const fileButton = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => analyseFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        size={inline ? "icon" : "default"}
        className={inline ? "h-12 w-12 shrink-0" : undefined}
        onClick={() => fileInput.current?.click()}
        disabled={busy}
        aria-label={inline ? "Les fra bilde eller PDF" : undefined}
      >
        <ImagePlus className="h-5 w-5" aria-hidden />
        {inline ? null : "Les fra bilde eller PDF"}
      </Button>
    </>
  );

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
    try {
      const res = await createEvents(converted.map((c) => (c as { row: EventRowDraft }).row));
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
    if (!inline) {
      router.push("/kalender");
      return;
    }
    setBusy(false);
    setRows(null);
    setText("");
    setSaved(chosen.length === 1 ? `«${chosen[0].title}» er lagt i kalenderen` : `${chosen.length} hendelser er lagt i kalenderen`);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(null), 5000);
    router.refresh();
  }

  if (rows && rows.length > 0) {
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
                    onChange={(e) => update(r.key, { selected: e.target.checked })}
                  />
                  Ta med
                </label>
              ) : null}
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
          {inline ? "Tilbake til teksten" : "Start på nytt"}
        </Button>
      </div>
    );
  }

  if (inline) {
    const long = text.length > 40 || text.includes("\n");
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <Label htmlFor="hurtig" className="sr-only">
            Ny hendelse: skriv eller lim inn tekst
          </Label>
          <Textarea
            id="hurtig"
            rows={long ? 5 : 1}
            className="min-h-12 flex-1 resize-none py-2.5"
            value={text}
            maxLength={8000}
            onChange={(e) => {
              setText(e.target.value);
              setSaved(null);
            }}
            placeholder="Skriv eller lim inn …"
          />
          {canPaste ? (
            <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={paste} disabled={busy} aria-label="Lim inn fra utklippstavla">
              <ClipboardPaste className="h-5 w-5" aria-hidden />
            </Button>
          ) : null}
          {fileButton}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <p role="status" className={saved ? "flex items-center gap-1.5 text-sm text-[var(--color-success)]" : "sr-only"}>
          {saved ? (
            <>
              <Check className="h-4 w-4" aria-hidden /> {saved}
            </>
          ) : null}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Link href="/kalender/ny" className="flex min-h-11 items-center px-1 text-sm text-[var(--color-primary)] underline">
            Fyll ut selv
          </Link>
          <Button type="button" size="sm" onClick={analyse} disabled={busy || text.trim().length < 3}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {busy ? (reading === "fil" ? "Leser fila …" : "Leser …") : "Legg inn"}
          </Button>
        </div>
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
        {busy ? (reading === "fil" ? "Leser fila …" : "Leser teksten …") : "Finn hendelser"}
      </Button>
      {fileButton}
    </div>
  );
}
