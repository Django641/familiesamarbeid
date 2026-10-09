"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Eraser, Trash2 } from "lucide-react";

import { PersonDots } from "@/components/person-dots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { notifyHousehold } from "@/lib/push-client";
import { createClient } from "@/lib/supabase/client";
import type { Person, Task } from "@/lib/types";
import { cn, dayLabel, osloDateKey } from "@/lib/utils";

type Filter = "alle" | "mine";

export function TaskList({
  householdId,
  tasks,
  people,
  myPersonId,
}: {
  householdId: string;
  tasks: Task[];
  people: Person[];
  myPersonId: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [local, setLocal] = useState(tasks);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");
  const [cleared, setCleared] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocal(tasks), [tasks]);
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const refresh = () => startTransition(() => router.refresh());
  const todayKey = osloDateKey(new Date());
  const adults = people.filter((p) => p.kind === "voksen");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase.from("tasks").insert({
      household_id: householdId,
      title: trimmed,
      assignee_person_id: assignee || null,
      due_date: due || null,
    });
    if (dbError) {
      setError("Klarte ikke å lagre. Prøv igjen.");
      return;
    }
    notifyHousehold(`la til gjøremålet «${trimmed}»`, "/gjoremal", "tasks");
    setTitle("");
    setDue("");
    refresh();
  }

  async function toggle(task: Task) {
    const done = !task.done;
    const done_at = done ? new Date().toISOString() : null;
    setLocal((prev) => prev.map((t) => (t.id === task.id ? { ...t, done, done_at } : t)));
    const { error: dbError } = await createClient().from("tasks").update({ done, done_at }).eq("id", task.id);
    if (dbError) setLocal((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    else refresh();
  }

  async function remove(task: Task) {
    setLocal((prev) => prev.filter((t) => t.id !== task.id));
    const { error: dbError } = await createClient().from("tasks").delete().eq("id", task.id);
    if (dbError) setLocal((prev) => [...prev, task]);
    else refresh();
  }

  async function clearDone() {
    const removed = local.filter((t) => t.done);
    if (removed.length === 0) return;
    setLocal((prev) => prev.filter((t) => !t.done));
    const { error: dbError } = await createClient()
      .from("tasks")
      .delete()
      .in(
        "id",
        removed.map((t) => t.id)
      );
    if (dbError) {
      setLocal((prev) => [...prev, ...removed]);
      setError("Klarte ikke å rydde. Prøv igjen.");
      return;
    }
    setCleared(removed);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setCleared(null), 8000);
    refresh();
  }

  async function undoClear() {
    const removed = cleared;
    if (!removed) return;
    setCleared(null);
    setLocal((prev) => [...prev, ...removed]);
    const { error: dbError } = await createClient()
      .from("tasks")
      .insert(removed.map(({ updated_at: _u, created_at: _c, ...rest }) => rest));
    if (dbError) {
      const ids = new Set(removed.map((t) => t.id));
      setLocal((prev) => prev.filter((t) => !ids.has(t.id)));
      setError("Klarte ikke å angre.");
    } else refresh();
  }

  const visible = local.filter((t) => filter === "alle" || !t.assignee_person_id || t.assignee_person_id === myPersonId);
  const open = visible.filter((t) => !t.done);
  const done = visible.filter((t) => t.done);

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="flex flex-col gap-2">
        <Input
          aria-label="Nytt gjøremål"
          placeholder="Nytt gjøremål …"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="send"
        />
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Hvem tar det?" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Hvem som helst</option>
            {adults.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Input aria-label="Frist (valgfritt)" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <Button type="submit" disabled={!title.trim()}>
          Legg til
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
      </form>

      {myPersonId ? (
        <div role="radiogroup" aria-label="Vis" className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--color-bg)] p-1">
          {(["alle", "mine"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "min-h-10 rounded-lg text-sm font-medium",
                filter === f ? "bg-[var(--color-surface)] shadow-sm" : "text-[var(--color-muted)]"
              )}
            >
              {f === "alle" ? "Alle" : "Mine"}
            </button>
          ))}
        </div>
      ) : null}

      {open.length === 0 ? (
        <p className="mt-4 text-center text-sm text-[var(--color-muted)]">Ingen åpne gjøremål. 🎉</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((t) => (
            <TaskRow key={t.id} task={t} people={people} todayKey={todayKey} onToggle={toggle} onRemove={remove} />
          ))}
        </ul>
      )}

      {done.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Gjort <span className="font-normal opacity-70">· {done.length}</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {done.slice(0, 20).map((t) => (
              <TaskRow key={t.id} task={t} people={people} todayKey={todayKey} onToggle={toggle} onRemove={remove} />
            ))}
          </ul>
          <Button variant="outline" size="sm" onClick={clearDone}>
            <Eraser className="h-4 w-4" aria-hidden /> Rydd bort gjorte ({done.length})
          </Button>
        </section>
      ) : null}

      {cleared ? (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-text)] px-4 py-3 text-sm text-[var(--color-surface)] shadow-lg">
            <span>{cleared.length === 1 ? "1 gjøremål fjernet" : `${cleared.length} gjøremål fjernet`}</span>
            <button type="button" onClick={undoClear} className="min-h-11 px-2 font-semibold underline">
              Angre
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  people,
  todayKey,
  onToggle,
  onRemove,
}: {
  task: Task;
  people: Person[];
  todayKey: string;
  onToggle: (t: Task) => void;
  onRemove: (t: Task) => void;
}) {
  const overdue = !task.done && task.due_date !== null && task.due_date < todayKey;
  return (
    <li>
      <Card className={cn(task.done && "opacity-70")}>
        <CardContent className="flex items-center gap-2 p-2">
          <button
            type="button"
            onClick={() => onToggle(task)}
            aria-label={task.done ? `Marker «${task.title}» som ikke gjort` : `Marker «${task.title}» som gjort`}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2",
              task.done
                ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
                : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
            )}
          >
            {task.done ? <Check className="h-4 w-4" aria-hidden /> : null}
          </button>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate font-medium", task.done && "line-through text-[var(--color-muted)]")}>
              {task.title}
            </p>
            {task.due_date ? (
              <p className={cn("text-xs", overdue ? "font-semibold text-[var(--color-danger)]" : "text-[var(--color-muted)]")}>
                Frist: {dayLabel(task.due_date, todayKey)}
              </p>
            ) : null}
          </div>
          <PersonDots people={people} ids={task.assignee_person_id ? [task.assignee_person_id] : []} />
          <button
            type="button"
            onClick={() => onRemove(task)}
            aria-label={`Slett «${task.title}»`}
            className="flex h-11 w-11 items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-danger)]"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </CardContent>
      </Card>
    </li>
  );
}
