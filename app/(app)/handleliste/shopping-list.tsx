"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Eraser, Loader2, Pencil, Sparkles, Store as StoreIcon, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import type { ShoppingItem, ShoppingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// To tilstander i en vanlig husholdning (Hyttekompis har i tillegg «Pakket»).
const NEXT_STATUS: Record<ShoppingStatus, ShoppingStatus> = {
  ma_kjopes: "kjopt",
  kjopt: "ma_kjopes",
};

const STATUS_LABEL: Record<ShoppingStatus, string> = {
  ma_kjopes: "Må kjøpes",
  kjopt: "Kjøpt",
};

export function ShoppingList({ items }: { items: ShoppingItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localItems, setLocalItems] = useState<ShoppingItem[]>(items);
  const [sorting, setSorting] = useState(false);
  const [sortError, setSortError] = useState<string | null>(null);
  const [cleared, setCleared] = useState<ShoppingItem[] | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  function updateLocal(id: string, changes: Partial<ShoppingItem>) {
    setLocalItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  }
  function removeLocal(id: string) {
    setLocalItems((prev) => prev.filter((i) => i.id !== id));
  }
  function restoreLocal(item: ShoppingItem) {
    setLocalItems((prev) => [...prev, item]);
  }

  // Dagligvare vises i AI-sortert butikk-rekkefølge; usorterte varer (null) sist.
  const dagligvare = localItems
    .filter((i) => i.category === "dagligvare")
    .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity));
  const annet = localItems.filter((i) => i.category !== "dagligvare");

  async function sortWithAi() {
    if (sorting || dagligvare.length < 2) return;
    setSorting(true);
    setSortError(null);

    const previous = new Map(dagligvare.map((i) => [i.id, i.sort_order]));
    function rollback() {
      setLocalItems((prev) =>
        prev.map((i) => (previous.has(i.id) ? { ...i, sort_order: previous.get(i.id) ?? null } : i))
      );
    }

    try {
      const res = await fetch("/api/sort-shopping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: dagligvare.map(({ id, name }) => ({ id, name })) }),
      });
      const data = (await res.json()) as { orderedIds?: string[]; error?: string };
      if (!res.ok || !data.orderedIds) {
        throw new Error(data.error ?? "Sortering feilet");
      }

      // Optimistisk: oppdater rekkefølgen lokalt før vi lagrer.
      const orderMap = new Map(data.orderedIds.map((id, i) => [id, i + 1]));
      setLocalItems((prev) =>
        prev.map((i) => (orderMap.has(i.id) ? { ...i, sort_order: orderMap.get(i.id)! } : i))
      );

      const supabase = createClient();
      const results = await Promise.all(
        data.orderedIds.map((id, i) =>
          supabase.from("shopping_items").update({ sort_order: i + 1 }).eq("id", id)
        )
      );
      if (results.some((r) => r.error)) {
        rollback();
        setSortError("Klarte ikke å lagre rekkefølgen. Prøv igjen.");
      } else {
        startTransition(() => router.refresh());
      }
    } catch (error) {
      rollback();
      setSortError(error instanceof Error ? error.message : "Sortering feilet");
    } finally {
      setSorting(false);
    }
  }

  const doneItems = localItems.filter((i) => i.status !== "ma_kjopes");

  async function clearDone() {
    if (doneItems.length === 0) return;
    setClearError(null);
    const removed = doneItems;
    const ids = removed.map((i) => i.id);
    setLocalItems((prev) => prev.filter((i) => i.status === "ma_kjopes"));

    const supabase = createClient();
    const { error } = await supabase.from("shopping_items").delete().in("id", ids);
    if (error) {
      setLocalItems((prev) => [...prev, ...removed]);
      setClearError("Klarte ikke å rydde lista. Prøv igjen.");
      return;
    }
    setCleared(removed);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setCleared(null), 8000);
    startTransition(() => router.refresh());
  }

  async function undoClear() {
    const removed = cleared;
    if (!removed) return;
    setCleared(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setLocalItems((prev) => [...prev, ...removed]);

    const supabase = createClient();
    const { error } = await supabase.from("shopping_items").insert(
      removed.map((i) => ({
        id: i.id,
        household_id: i.household_id,
        name: i.name,
        category: i.category,
        store: i.store,
        status: i.status,
        comment: i.comment,
        sort_order: i.sort_order,
        created_by: i.created_by,
      }))
    );
    if (error) {
      const ids = new Set(removed.map((i) => i.id));
      setLocalItems((prev) => prev.filter((i) => !ids.has(i.id)));
      setClearError("Klarte ikke å angre. Varene er fjernet.");
    } else {
      startTransition(() => router.refresh());
    }
  }

  const undoToast =
    cleared !== null ? (
      <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-text)] px-4 py-3 text-sm text-[var(--color-surface)] shadow-lg">
          <span>
            {cleared.length === 1 ? "1 vare fjernet" : `${cleared.length} varer fjernet`}
          </span>
          <button
            type="button"
            onClick={undoClear}
            className="min-h-11 shrink-0 px-2 font-semibold underline underline-offset-2"
          >
            Angre
          </button>
        </div>
      </div>
    ) : null;

  if (localItems.length === 0) {
    return (
      <>
        <p className="mt-8 text-center text-sm text-[var(--color-muted)]">Handlelista er tom.</p>
        {undoToast}
      </>
    );
  }

  const rowProps = { updateLocal, removeLocal, restoreLocal };

  return (
    <div className="flex flex-col gap-5">
      {dagligvare.length > 1 ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={sortWithAi}
            disabled={sorting}
            className={cn(
              "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-primary)] transition-colors",
              sorting ? "opacity-70" : "hover:border-[var(--color-primary)]"
            )}
          >
            {sorting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Sorterer…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden />
                Sorter etter butikk-rekkefølge
              </>
            )}
          </button>
          {sortError ? (
            <p role="alert" className="px-1 text-xs text-[var(--color-danger)]">
              {sortError}
            </p>
          ) : null}
        </div>
      ) : null}
      <Section title="Dagligvare" items={dagligvare} rowProps={rowProps} />
      <AnnetSection items={annet} rowProps={rowProps} />
      {doneItems.length > 0 ? (
        <button
          type="button"
          onClick={clearDone}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
        >
          <Eraser className="h-4 w-4" aria-hidden />
          Rydd bort kjøpte ({doneItems.length})
        </button>
      ) : null}
      {clearError ? (
        <p role="alert" className="px-1 text-xs text-[var(--color-danger)]">
          {clearError}
        </p>
      ) : null}
      {undoToast}
    </div>
  );
}

type RowProps = {
  updateLocal: (id: string, changes: Partial<ShoppingItem>) => void;
  removeLocal: (id: string) => void;
  restoreLocal: (item: ShoppingItem) => void;
};

function Section({
  title,
  items,
  rowProps,
}: {
  title: string;
  items: ShoppingItem[];
  rowProps: RowProps;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {title} <span className="font-normal opacity-70">· {items.length}</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <Row key={item.id} item={item} {...rowProps} />
        ))}
      </ul>
    </section>
  );
}

function AnnetSection({ items, rowProps }: { items: ShoppingItem[]; rowProps: RowProps }) {
  if (items.length === 0) return null;

  const groups = new Map<string, { display: string; items: ShoppingItem[] }>();
  for (const item of items) {
    const key = (item.store ?? "").trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, {
        display: item.store?.trim() || "Uten butikk",
        items: [item],
      });
    }
  }
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b, "nb");
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Annet <span className="font-normal opacity-70">· {items.length}</span>
      </h2>
      {sortedGroups.map(([key, { display, items: groupItems }]) => (
        <div key={key} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 px-1">
            <StoreIcon className="h-3.5 w-3.5 text-[var(--color-muted)]" aria-hidden />
            <span className="text-xs font-medium text-[var(--color-text)]">{display}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {groupItems.map((item) => (
              <Row key={item.id} item={item} {...rowProps} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Row({
  item,
  updateLocal,
  removeLocal,
  restoreLocal,
}: { item: ShoppingItem } & RowProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.name);
  const [categoryDraft, setCategoryDraft] = useState(item.category ?? "dagligvare");
  const [storeDraft, setStoreDraft] = useState(item.store ?? "");

  function invalidate() {
    startTransition(() => router.refresh());
  }

  async function cycle() {
    const next = NEXT_STATUS[item.status];
    updateLocal(item.id, { status: next });
    const supabase = createClient();
    const { error } = await supabase
      .from("shopping_items")
      .update({ status: next })
      .eq("id", item.id);
    if (error) updateLocal(item.id, { status: item.status });
    else invalidate();
  }

  async function remove() {
    removeLocal(item.id);
    const supabase = createClient();
    const { error } = await supabase.from("shopping_items").delete().eq("id", item.id);
    if (error) restoreLocal(item);
    else invalidate();
  }

  function openEdit() {
    setNameDraft(item.name);
    setCategoryDraft(item.category ?? "dagligvare");
    setStoreDraft(item.store ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    const name = nameDraft.trim();
    if (!name) return;
    const changes = {
      name,
      category: categoryDraft,
      store: categoryDraft === "annet" ? storeDraft.trim() || null : null,
    };
    const original = { name: item.name, category: item.category, store: item.store };
    updateLocal(item.id, changes);
    setEditing(false);
    const supabase = createClient();
    const { error } = await supabase.from("shopping_items").update(changes).eq("id", item.id);
    if (error) updateLocal(item.id, original);
    else invalidate();
  }

  const inactive = item.status !== "ma_kjopes";

  if (editing) {
    return (
      <li>
        <Card>
          <CardContent className="flex flex-col gap-2 p-3">
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Navn på vare"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div
              role="radiogroup"
              className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-bg)] p-1"
            >
              {(["dagligvare", "annet"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={categoryDraft === c}
                  onClick={() => setCategoryDraft(c)}
                  className={cn(
                    "h-10 rounded-lg text-sm font-medium transition-colors",
                    categoryDraft === c
                      ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                      : "text-[var(--color-muted)]"
                  )}
                >
                  {c === "dagligvare" ? "Dagligvare" : "Annet"}
                </button>
              ))}
            </div>
            {categoryDraft === "annet" ? (
              <Input
                value={storeDraft}
                onChange={(e) => setStoreDraft(e.target.value)}
                placeholder="Butikk (valgfri, f.eks. Clas Ohlson)"
                autoComplete="off"
              />
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={!nameDraft.trim()}
                className="min-h-11 flex-1 rounded-xl bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50"
              >
                Lagre
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-11 flex-1 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-text)]"
              >
                Avbryt
              </button>
            </div>
          </CardContent>
        </Card>
      </li>
    );
  }

  return (
    <li>
      <Card className={cn(inactive && "opacity-70")}>
        <CardContent className="flex items-center gap-2 p-2">
          <button
            type="button"
            onClick={cycle}
            aria-label={`Endre status (nå: ${STATUS_LABEL[item.status]})`}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              item.status === "kjopt"
                ? "border-[var(--color-success)] bg-[var(--color-success)] text-white"
                : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
            )}
          >
            {item.status !== "ma_kjopes" ? <Check className="h-4 w-4" /> : null}
          </button>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate font-medium",
                item.status === "kjopt" && "line-through text-[var(--color-muted)]"
              )}
            >
              {item.name}
            </p>
            <p className="text-xs text-[var(--color-muted)]">{STATUS_LABEL[item.status]}</p>
          </div>
          {item.status === "ma_kjopes" ? (
            <Badge variant="muted">{STATUS_LABEL[item.status]}</Badge>
          ) : null}
          <button
            type="button"
            onClick={openEdit}
            aria-label={`Rediger ${item.name}`}
            className="flex h-11 w-9 items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-primary)]"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={remove}
            aria-label={`Slett ${item.name}`}
            className="flex h-11 w-9 items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-danger)]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </CardContent>
      </Card>
    </li>
  );
}
