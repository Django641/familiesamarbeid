"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, Eraser, Plus, Trash2 } from "lucide-react";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { UndoToast } from "@/components/ui/undo-toast";
import type { Person, Task } from "@/lib/types";
import { addDays, cn, dayLabel, osloDateKey } from "@/lib/utils";

import { addTask, clearDoneTasks, deleteTask, restoreTasks, setTaskDone, updateTask } from "./actions";

type Filter = "alle" | "mine";
type Group = { key: string; title: string; tone?: "danger" | "primary"; tasks: Task[] };

function nextMonday(todayKey: string): string {
  const weekday = new Date(`${todayKey}T12:00:00Z`).getUTCDay(); // 0 = søndag
  return addDays(todayKey, ((8 - weekday) % 7) || 7);
}

/** Grupperer åpne gjøremål etter frist — det som haster står øverst. */
function groupTasks(open: Task[], todayKey: string): Group[] {
  const tomorrow = addDays(todayKey, 1);
  const weekEnd = addDays(todayKey, 6);
  const groups: Group[] = [
    { key: "forfalt", title: "Forfalt", tone: "danger", tasks: [] },
    { key: "idag", title: "I dag", tone: "primary", tasks: [] },
    { key: "imorgen", title: "I morgen", tasks: [] },
    { key: "uka", title: "Denne uka", tasks: [] },
    { key: "senere", title: "Senere", tasks: [] },
    { key: "uten", title: "Uten frist", tasks: [] },
  ];
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
  for (const t of open) {
    const d = t.due_date;
    const key = !d ? "uten" : d < todayKey ? "forfalt" : d === todayKey ? "idag" : d === tomorrow ? "imorgen" : d <= weekEnd ? "uka" : "senere";
    byKey[key].tasks.push(t);
  }
  for (const g of groups) {
    g.tasks.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || +new Date(b.created_at) - +new Date(a.created_at));
  }
  return groups.filter((g) => g.tasks.length > 0);
}

export function TaskBoard({ tasks, people, me }: { tasks: Task[]; people: Person[]; me: Person }) {
  const [local, setLocal] = useState(tasks);
  const [filter, setFilter] = useState<Filter>("alle");
  const [editing, setEditing] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocal(tasks), [tasks]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const todayKey = osloDateKey(new Date());
  const visible = local.filter(
    (t) => filter === "alle" || t.assignee_person_id === null || t.assignee_person_id === me.id
  );
  const open = visible.filter((t) => !t.done);
  const doneList = visible
    .filter((t) => t.done)
    .sort((a, b) => +new Date(b.done_at ?? 0) - +new Date(a.done_at ?? 0));
  const groups = useMemo(() => groupTasks(open, todayKey), [open, todayKey]);
  const personById = new Map(people.map((p) => [p.id, p]));

  function showToast(message: string, undo: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }

  function patchLocal(id: string, changes: Partial<Task>) {
    setLocal((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  }

  async function toggle(task: Task) {
    const isDone = !task.done;
    patchLocal(task.id, { done: isDone, done_at: isDone ? new Date() : null });
    if (isDone) {
      showToast(`«${task.title}» er gjort`, () => {
        setToast(null);
        toggle({ ...task, done: true });
      });
    }
    try {
      await setTaskDone(task.id, isDone);
    } catch {
      patchLocal(task.id, { done: task.done, done_at: task.done_at });
      setError("Klarte ikke å lagre. Sjekk nettet og prøv igjen.");
    }
  }

  async function remove(task: Task) {
    setEditing(null);
    setLocal((prev) => prev.filter((t) => t.id !== task.id));
    showToast(`«${task.title}» er slettet`, async () => {
      setToast(null);
      setLocal((prev) => [...prev, task]);
      await restoreTasks([task]).catch(() => setError("Klarte ikke å angre."));
    });
    try {
      await deleteTask(task.id);
    } catch {
      setLocal((prev) => [...prev, task]);
      setError("Klarte ikke å slette. Prøv igjen.");
    }
  }

  async function clearDone() {
    const removed = local.filter((t) => t.done);
    setLocal((prev) => prev.filter((t) => !t.done));
    try {
      const res = await clearDoneTasks();
      const rows = res.removed ?? removed;
      showToast(rows.length === 1 ? "1 gjøremål ryddet bort" : `${rows.length} gjøremål ryddet bort`, async () => {
        setToast(null);
        setLocal((prev) => [...prev, ...rows]);
        await restoreTasks(rows).catch(() => setError("Klarte ikke å angre."));
      });
    } catch {
      setLocal((prev) => [...prev, ...removed]);
      setError("Klarte ikke å rydde. Prøv igjen.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Composer people={people} me={me} todayKey={todayKey} onError={setError} />

      <Segmented
        label="Vis gjøremål"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "alle", label: "Alle" },
          { value: "mine", label: "Mine og felles" },
        ]}
      />

      {error ? (
        <p role="alert" className="-mt-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
          <p className="text-3xl" aria-hidden>
            🎉
          </p>
          <p className="mt-2 font-medium">Ingenting å gjøre</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Nyt det — eller legg inn neste ting over.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={`g-${g.key}`} className="flex flex-col gap-2">
            <h2
              id={`g-${g.key}`}
              className={cn(
                "px-1 text-xs font-semibold uppercase tracking-wider",
                g.tone === "danger"
                  ? "text-[var(--color-danger)]"
                  : g.tone === "primary"
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-muted)]"
              )}
            >
              {g.title} <span className="font-normal opacity-70">· {g.tasks.length}</span>
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
              {g.tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  assignee={t.assignee_person_id ? personById.get(t.assignee_person_id) : undefined}
                  todayKey={todayKey}
                  onToggle={() => toggle(t)}
                  onOpen={() => setEditing(t)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {doneList.length > 0 ? (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="flex min-h-11 items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", showDone && "rotate-180")} aria-hidden />
            Gjort <span className="font-normal opacity-70">· {doneList.length}</span>
          </button>
          {showDone ? (
            <>
              <ul className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                {doneList.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    assignee={t.assignee_person_id ? personById.get(t.assignee_person_id) : undefined}
                    todayKey={todayKey}
                    onToggle={() => toggle(t)}
                    onOpen={() => setEditing(t)}
                  />
                ))}
              </ul>
              <Button variant="ghost" size="sm" onClick={clearDone} className="self-center text-[var(--color-muted)]">
                <Eraser className="h-4 w-4" aria-hidden /> Rydd bort gjorte
              </Button>
            </>
          ) : null}
        </section>
      ) : null}

      <EditSheet
        task={editing}
        people={people}
        me={me}
        todayKey={todayKey}
        onClose={() => setEditing(null)}
        onDelete={remove}
        onSaved={(t) => patchLocal(t.id, t)}
        onError={setError}
      />

      <UndoToast message={toast?.message ?? null} onUndo={() => toast?.undo()} />
    </div>
  );
}

function TaskRow({
  task,
  assignee,
  todayKey,
  onToggle,
  onOpen,
}: {
  task: Task;
  assignee?: Person;
  todayKey: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const overdue = !task.done && task.due_date !== null && task.due_date < todayKey;
  return (
    <li className="flex items-center gap-1 border-b border-[var(--color-border)] pr-3 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label={task.done ? `Marker «${task.title}» som ikke gjort` : `Marker «${task.title}» som gjort`}
        className="flex h-14 w-14 shrink-0 items-center justify-center"
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
            task.done
              ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
              : "border-[var(--color-border)]"
          )}
        >
          {task.done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : null}
        </span>
      </button>
      <button type="button" onClick={onOpen} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className={cn("block break-words", task.done && "text-[var(--color-muted)] line-through")}>
            {task.title}
          </span>
          {task.due_date && !task.done ? (
            <span
              className={cn(
                "mt-0.5 inline-flex items-center gap-1 text-xs",
                overdue ? "font-semibold text-[var(--color-danger)]" : "text-[var(--color-muted)]"
              )}
            >
              <CalendarDays className="h-3 w-3" aria-hidden />
              {dayLabel(task.due_date, todayKey)}
            </span>
          ) : null}
          {task.notes && !task.done ? (
            <span className="mt-0.5 block truncate text-xs text-[var(--color-muted)]">{task.notes}</span>
          ) : null}
        </span>
        {assignee ? <Avatar person={assignee} size="sm" /> : null}
      </button>
    </li>
  );
}

/** Rask innlegging. «Hvem» og «Når» dukker opp når du begynner å skrive. */
function Composer({
  people,
  me,
  todayKey,
  onError,
}: {
  people: Person[];
  me: Person;
  todayKey: string;
  onError: (e: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    onError(null);
    try {
      const res = await addTask({ title: trimmed, assignee_person_id: assignee, due_date: due });
      if (res.error) onError(res.error);
      else {
        // Nullstill alt, så neste gjøremål ikke arver «hvem» og frist fra forrige.
        setTitle("");
        setAssignee(null);
        setDue(null);
        inputRef.current?.focus();
      }
    } catch {
      onError("Klarte ikke å lagre. Sjekk nettet og prøv igjen.");
    } finally {
      setBusy(false);
    }
  }

  const expanded = title.trim().length > 0;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          aria-label="Nytt gjøremål"
          placeholder="Hva må gjøres?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="send"
          autoComplete="off"
          className="border-0 bg-[var(--color-bg)]"
        />
        <Button type="submit" size="icon" className="h-12 w-12 shrink-0" aria-label="Legg til" disabled={!expanded || busy}>
          <Plus className="h-6 w-6" aria-hidden />
        </Button>
      </div>
      {expanded ? (
        <>
          <AssigneePicker people={people} me={me} value={assignee} onChange={setAssignee} />
          <DuePicker todayKey={todayKey} value={due} onChange={setDue} />
        </>
      ) : null}
    </form>
  );
}

function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
        active
          ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      )}
    >
      {children}
    </button>
  );
}

function AssigneePicker({
  people,
  me,
  value,
  onChange,
}: {
  people: Person[];
  me: Person;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  // Meg først, så den andre voksne, så barna.
  const ordered = [me, ...people.filter((p) => p.id !== me.id && p.kind === "voksen"), ...people.filter((p) => p.kind === "barn")];
  return (
    <div role="group" aria-label="Hvem tar det?" className="-mx-3 flex gap-2 overflow-x-auto px-3">
      <Chip active={value === null} onClick={() => onChange(null)}>
        Felles
      </Chip>
      {ordered.map((p) => (
        <Chip key={p.id} active={value === p.id} onClick={() => onChange(value === p.id ? null : p.id)}>
          <Avatar person={p} size="sm" className="-ml-1.5" />
          {p.id === me.id ? "Meg" : p.name}
        </Chip>
      ))}
    </div>
  );
}

function DuePicker({ todayKey, value, onChange }: { todayKey: string; value: string | null; onChange: (d: string | null) => void }) {
  const quick = [
    { key: todayKey, label: "I dag" },
    { key: addDays(todayKey, 1), label: "I morgen" },
    { key: nextMonday(todayKey), label: "Neste uke" },
  ];
  const custom = value !== null && !quick.some((q) => q.key === value);
  return (
    <div role="group" aria-label="Frist" className="-mx-3 flex items-center gap-2 overflow-x-auto px-3">
      <Chip active={value === null} onClick={() => onChange(null)}>
        Ingen frist
      </Chip>
      {quick.map((q) => (
        <Chip key={q.label} active={value === q.key} onClick={() => onChange(value === q.key ? null : q.key)}>
          {q.label}
        </Chip>
      ))}
      <label
        className={cn(
          "relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
          custom
            ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            : "border-[var(--color-border)] bg-[var(--color-surface)]"
        )}
      >
        <CalendarDays className="h-4 w-4" aria-hidden />
        {custom ? dayLabel(value!, todayKey) : "Dato"}
        <input
          type="date"
          aria-label="Velg dato"
          className="absolute inset-0 opacity-0"
          min={todayKey}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </label>
    </div>
  );
}

function EditSheet({
  task,
  people,
  me,
  todayKey,
  onClose,
  onDelete,
  onSaved,
  onError,
}: {
  task: Task | null;
  people: Person[];
  me: Person;
  todayKey: string;
  onClose: () => void;
  onDelete: (t: Task) => void;
  onSaved: (t: Task) => void;
  onError: (e: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setAssignee(task.assignee_person_id);
    setDue(task.due_date);
  }, [task]);

  if (!task) return <Sheet open={false} onClose={onClose} title="Gjøremål">{null}</Sheet>;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !title.trim()) return;
    setBusy(true);
    const input = { title: title.trim(), notes: notes.trim() || null, assignee_person_id: assignee, due_date: due };
    onSaved({ ...task, ...input });
    onClose();
    try {
      const res = await updateTask(task.id, input);
      if (res.error) onError(res.error);
    } catch {
      onSaved(task);
      onError("Klarte ikke å lagre endringen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Gjøremål">
      <form onSubmit={save} className="flex flex-col gap-4">
        <Input aria-label="Tittel" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          aria-label="Notat"
          placeholder="Notat (valgfritt)"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Hvem</span>
          <AssigneePicker people={people} me={me} value={assignee} onChange={setAssignee} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Frist</span>
          <DuePicker todayKey={todayKey} value={due} onChange={setDue} />
        </div>
        <Button type="submit" size="lg" disabled={busy || !title.trim()}>
          Lagre
        </Button>
        <Button type="button" variant="ghost" className="text-[var(--color-danger)]" onClick={() => onDelete(task)}>
          <Trash2 className="h-4 w-4" aria-hidden /> Slett gjøremålet
        </Button>
      </form>
    </Sheet>
  );
}
