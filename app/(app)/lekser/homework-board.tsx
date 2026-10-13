"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

import { Avatar } from "@/components/avatar";
import { Button, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { UndoToast } from "@/components/ui/undo-toast";
import { groupWeek, type HomeworkEntry, weekLabel, weekdayShort } from "@/lib/homework";
import type { Person } from "@/lib/types";
import { isoWeek } from "@/lib/week-layout";
import { useServerState } from "@/lib/use-server-state";
import { addDays, cn, dayLabel } from "@/lib/utils";

import { addHomeworkItem, deleteHomeworkItem, restoreHomeworkItem, setHomeworkDone, updateHomeworkItem } from "./actions";

type PlanDoc = { id: string; name: string; person_id: string };
type SheetState = { mode: "add" } | { mode: "edit"; entry: HomeworkEntry } | null;

function href(path: string, week: string, child: string) {
  const q = new URLSearchParams({ uke: week });
  if (child !== "alle") q.set("barn", child);
  return `${path}?${q.toString()}`;
}

const chipClass = (active: boolean) =>
  cn(
    "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
    active
      ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
      : "border-[var(--color-border)] bg-[var(--color-surface)]"
  );

export function HomeworkBoard({
  kids,
  selected,
  weekStart,
  todayKey,
  entries,
  documents,
}: {
  kids: Person[];
  selected: string;
  weekStart: string;
  todayKey: string;
  entries: HomeworkEntry[];
  documents: PlanDoc[];
}) {
  const [local, setLocal, track] = useServerState(entries);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<{ message: string; undo: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const shown = selected === "alle" ? kids : kids.filter((k) => k.id === selected);
  const personById = new Map(kids.map((k) => [k.id, k]));
  const order = new Map(kids.map((k, i) => [k.id, i]));
  const sorted = [...local].sort((a, b) => (order.get(a.person_id) ?? 0) - (order.get(b.person_id) ?? 0));
  const { goals, wholeWeek, days } = groupWeek(sorted, order);
  const empty = local.length === 0 && documents.length === 0;
  const multi = shown.length > 1;

  function showToast(message: string, undo: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }

  function patch(id: string, changes: Partial<HomeworkEntry>) {
    setLocal((prev) => prev.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  }

  async function toggle(entry: HomeworkEntry) {
    setError(null);
    const isDone = !entry.done;
    patch(entry.id, { done: isDone, done_at: isDone ? new Date() : null });
    try {
      const res = await track(setHomeworkDone(entry.id, isDone));
      if (res.error) throw new Error(res.error);
    } catch {
      patch(entry.id, { done: entry.done, done_at: entry.done_at });
      setError("Klarte ikke å lagre. Sjekk nettet og prøv igjen.");
    }
  }

  async function save(entry: HomeworkEntry, input: { text: string; kind: "lekse" | "mal"; due_date: string | null }) {
    setError(null);
    const changes = { ...input, due_date: input.kind === "mal" ? null : input.due_date, done: input.kind === "mal" ? false : entry.done };
    patch(entry.id, changes);
    try {
      const res = await track(updateHomeworkItem(entry.id, input));
      if (res.error) throw new Error(res.error);
    } catch (e) {
      patch(entry.id, entry);
      setError(e instanceof Error && e.message ? e.message : "Klarte ikke å lagre endringen.");
    }
  }

  async function add(personId: string, input: { text: string; kind: "lekse" | "mal"; due_date: string | null }) {
    setError(null);
    const id = crypto.randomUUID();
    const position = Math.max(-1, ...local.filter((e) => e.person_id === personId).map((e) => e.position)) + 1;
    const created: HomeworkEntry = {
      id,
      person_id: personId,
      ...input,
      due_date: input.kind === "mal" ? null : input.due_date,
      done: false,
      done_at: null,
      source: "manuell",
      position,
    };
    setLocal((prev) => [...prev, created]);
    try {
      const res = await track(addHomeworkItem({ id, person_id: personId, week_start: weekStart, ...input, position }));
      if (res.error) throw new Error(res.error);
    } catch (e) {
      setLocal((prev) => prev.filter((x) => x.id !== id));
      setError(e instanceof Error && e.message ? e.message : "Klarte ikke å legge til. Prøv igjen.");
    }
  }

  async function remove(entry: HomeworkEntry) {
    setError(null);
    setSheet(null);
    setLocal((prev) => prev.filter((e) => e.id !== entry.id));
    showToast(`«${entry.text}» er slettet`, async () => {
      setToast(null);
      setLocal((prev) => [...prev, entry]);
      await track(
        restoreHomeworkItem({
          id: entry.id,
          person_id: entry.person_id,
          week_start: weekStart,
          text: entry.text,
          kind: entry.kind,
          due_date: entry.due_date,
          source: entry.source,
          done: entry.done,
          position: entry.position,
        }).then((r) => {
          if (r.error) throw new Error(r.error);
        })
      ).catch(() => setError("Klarte ikke å angre."));
    });
    try {
      await track(deleteHomeworkItem(entry.id));
    } catch {
      setLocal((prev) => [...prev, entry]);
      setError("Klarte ikke å slette. Prøv igjen.");
    }
  }

  const uploadHref = href("/lekser/ny", weekStart, selected);

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Velg barn" className="-mx-4 flex gap-2 overflow-x-auto px-4">
        <Link href={href("/lekser", weekStart, "alle")} aria-current={selected === "alle" ? "page" : undefined} className={chipClass(selected === "alle")}>
          Begge
        </Link>
        {kids.map((k) => (
          <Link key={k.id} href={href("/lekser", weekStart, k.id)} aria-current={selected === k.id ? "page" : undefined} className={chipClass(selected === k.id)}>
            {k.name}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={href("/lekser", addDays(weekStart, -7), selected)}
          aria-label="Forrige uke"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h2 className="text-center text-base font-semibold" aria-live="polite">
          {weekLabel(weekStart)}
        </h2>
        <Link
          href={href("/lekser", addDays(weekStart, 7), selected)}
          aria-label="Neste uke"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {empty ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
          <p className="text-3xl" aria-hidden>
            📚
          </p>
          <p className="mt-2 font-medium">Ingen ukeplan for uke {isoWeek(weekStart)}</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Last opp planen fra skolen, så sorterer vi den for dere.</p>
          <Link href={uploadHref} className={buttonClass("default", "lg", "mt-4")}>
            <Camera className="h-5 w-5" aria-hidden /> Last opp ukeplan
          </Link>
        </div>
      ) : null}

      {goals.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-2xl bg-[var(--color-bg)] px-3 py-1" aria-label="Ukens mål">
          {goals.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => setSheet({ mode: "edit", entry: g })} className="flex min-h-11 w-full items-center gap-2 text-left text-sm">
                {multi && personById.get(g.person_id) ? <Avatar person={personById.get(g.person_id)!} size="sm" /> : null}
                <span>
                  <span className="font-semibold">Mål:</span> {g.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {documents.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Originaler">
          {documents.map((d) => (
            <li key={d.id}>
              <a
                href={`/api/filer/${d.id}`}
                target="_blank"
                rel="noopener"
                className="flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm"
              >
                <span aria-hidden>📄</span> {d.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {wholeWeek.length > 0 ? (
        <Section title="Hele uka" count={wholeWeek.length}>
          {wholeWeek.map((e) => (
            <Row key={e.id} entry={e} person={multi ? personById.get(e.person_id) : undefined} onToggle={() => toggle(e)} onOpen={() => setSheet({ mode: "edit", entry: e })} />
          ))}
        </Section>
      ) : null}

      {days.map((d) => (
        <Section key={d.dateKey} title={dayLabel(d.dateKey, todayKey)} count={d.entries.length} today={d.dateKey === todayKey}>
          {d.entries.map((e) => (
            <Row key={e.id} entry={e} person={multi ? personById.get(e.person_id) : undefined} onToggle={() => toggle(e)} onOpen={() => setSheet({ mode: "edit", entry: e })} />
          ))}
        </Section>
      ))}

      <div className="flex flex-col gap-2">
        <Button variant="secondary" size="lg" onClick={() => setSheet({ mode: "add" })}>
          <Plus className="h-5 w-5" aria-hidden /> Legg til
        </Button>
        {!empty ? (
          <Link href={uploadHref} className={buttonClass("ghost", "default", "text-[var(--color-primary)]")}>
            <Plus className="h-4 w-4" aria-hidden /> Last opp ukeplan
          </Link>
        ) : null}
      </div>

      <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet?.mode === "edit" ? "Rediger" : "Ny lekse"}>
        {sheet ? (
          <ItemForm
            key={sheet.mode === "edit" ? sheet.entry.id : "ny"}
            entry={sheet.mode === "edit" ? sheet.entry : null}
            kids={shown}
            weekStart={weekStart}
            onCancel={() => setSheet(null)}
            onDelete={remove}
            onSubmit={(personId, input) => {
              setSheet(null);
              if (sheet.mode === "edit") void save(sheet.entry, input);
              else void add(personId, input);
            }}
          />
        ) : null}
      </Sheet>

      <UndoToast message={toast?.message ?? null} onUndo={() => toast?.undo()} />
    </div>
  );
}

function Section({ title, count, today, children }: { title: string; count: number; today?: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className={cn("px-1 text-xs font-semibold uppercase tracking-wider", today ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]")}>
        {title} <span className="font-normal opacity-70">· {count}</span>
      </h3>
      <ul className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">{children}</ul>
    </section>
  );
}

function Row({ entry, person, onToggle, onOpen }: { entry: HomeworkEntry; person?: Person; onToggle: () => void; onOpen: () => void }) {
  return (
    <li className="flex items-center gap-1 border-b border-[var(--color-border)] pr-3 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label={entry.done ? `Marker «${entry.text}» som ikke gjort` : `Marker «${entry.text}» som gjort`}
        className="flex h-14 w-14 shrink-0 items-center justify-center"
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
            entry.done
              ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
              : "border-[var(--color-border)]"
          )}
        >
          {entry.done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : null}
        </span>
      </button>
      <button type="button" onClick={onOpen} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left">
        <span className={cn("min-w-0 flex-1 break-words", entry.done && "text-[var(--color-muted)] line-through")}>{entry.text}</span>
        {person ? <Avatar person={person} size="sm" /> : null}
      </button>
    </li>
  );
}

function ItemForm({
  entry,
  kids,
  weekStart,
  onCancel,
  onDelete,
  onSubmit,
}: {
  entry: HomeworkEntry | null;
  kids: Person[];
  weekStart: string;
  onCancel: () => void;
  onDelete: (e: HomeworkEntry) => void;
  onSubmit: (personId: string, input: { text: string; kind: "lekse" | "mal"; due_date: string | null }) => void;
}) {
  const [text, setText] = useState(entry?.text ?? "");
  const [kind, setKind] = useState<"lekse" | "mal">(entry?.kind ?? "lekse");
  const [due, setDue] = useState<string | null>(entry?.due_date ?? null);
  const [personId, setPersonId] = useState(entry?.person_id ?? kids[0]?.id ?? "");
  const days = [0, 1, 2, 3, 4].map((n) => addDays(weekStart, n));
  // Ligger leksa i helga, får den en egen chip så valget ikke forsvinner.
  const extra = due && !days.includes(due) ? [due] : [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || !personId) return;
        onSubmit(personId, { text: text.trim(), kind, due_date: kind === "mal" ? null : due });
      }}
      className="flex flex-col gap-4"
    >
      <Input aria-label="Tekst" placeholder="Hva skal gjøres?" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} autoComplete="off" />

      {!entry && kids.length > 1 ? (
        <div role="group" aria-label="Til" className="flex flex-wrap gap-2">
          {kids.map((k) => (
            <button key={k.id} type="button" aria-pressed={personId === k.id} onClick={() => setPersonId(k.id)} className={chipClass(personId === k.id)}>
              {k.name}
            </button>
          ))}
        </div>
      ) : null}

      <Segmented
        label="Type"
        value={kind}
        onChange={setKind}
        options={[
          { value: "lekse", label: "Lekse" },
          { value: "mal", label: "Mål" },
        ]}
      />

      {kind === "lekse" ? (
        <div role="group" aria-label="Ferdig til" className="-mx-5 flex gap-2 overflow-x-auto px-5">
          <button type="button" aria-pressed={due === null} onClick={() => setDue(null)} className={chipClass(due === null)}>
            Hele uka
          </button>
          {[...days, ...extra].map((d) => (
            <button key={d} type="button" aria-pressed={due === d} aria-label={dayLabel(d)} onClick={() => setDue(d)} className={chipClass(due === d)}>
              {weekdayShort(d)}
            </button>
          ))}
        </div>
      ) : null}

      <Button type="submit" size="lg" disabled={!text.trim()}>
        Lagre
      </Button>
      {entry ? (
        <Button type="button" variant="ghost" className="text-[var(--color-danger)]" onClick={() => onDelete(entry)}>
          <Trash2 className="h-4 w-4" aria-hidden /> Slett
        </Button>
      ) : (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Avbryt
        </Button>
      )}
    </form>
  );
}
