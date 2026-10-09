"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eraser, Loader2, Sparkles, Store as StoreIcon, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { UndoToast } from "@/components/ui/undo-toast";
import type { ShoppingItem, ShoppingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

import {
  clearBought,
  deleteShoppingItem,
  restoreShoppingItems,
  setShoppingStatus,
  sortShoppingList,
  updateShoppingItem,
} from "./actions";

// Funksjonene er portert fra Hyttekompis (docs/HANDLELISTE.md der); utseendet er nytt.
// To statuser i en vanlig husholdning: må kjøpes ↔ kjøpt.
const NEXT_STATUS: Record<ShoppingStatus, ShoppingStatus> = { ma_kjopes: "kjopt", kjopt: "ma_kjopes" };

export function ShoppingList({ items }: { items: ShoppingItem[] }) {
  const [local, setLocal] = useState<ShoppingItem[]>(items);
  const [sorting, setSorting] = useState(false);
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [toast, setToast] = useState<{ message: string; undo: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocal(items), [items]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  function showToast(message: string, undo: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }
  const patch = (id: string, changes: Partial<ShoppingItem>) =>
    setLocal((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));

  // Dagligvarer i AI-sortert butikkrekkefølge (usorterte sist); «Annet» gruppert per butikk.
  const dagligvare = local
    .filter((i) => i.category === "dagligvare")
    .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity));
  const annet = local.filter((i) => i.category !== "dagligvare");
  const bought = local.filter((i) => i.status === "kjopt");
  const toBuy = local.length - bought.length;

  async function cycle(item: ShoppingItem) {
    const next = NEXT_STATUS[item.status];
    patch(item.id, { status: next });
    try {
      await setShoppingStatus(item.id, next);
    } catch {
      patch(item.id, { status: item.status });
      setError("Klarte ikke å lagre. Sjekk nettet.");
    }
  }

  async function remove(item: ShoppingItem) {
    setEditing(null);
    setLocal((prev) => prev.filter((i) => i.id !== item.id));
    showToast(`«${item.name}» er fjernet`, async () => {
      setToast(null);
      setLocal((prev) => [...prev, item]);
      await restoreShoppingItems([item]).catch(() => setError("Klarte ikke å angre."));
    });
    try {
      await deleteShoppingItem(item.id);
    } catch {
      setLocal((prev) => [...prev, item]);
      setError("Klarte ikke å fjerne varen.");
    }
  }

  async function clearDone() {
    const removed = bought;
    setLocal((prev) => prev.filter((i) => i.status === "ma_kjopes"));
    try {
      const res = await clearBought();
      const rows = res.removed ?? removed;
      showToast(rows.length === 1 ? "1 vare ryddet bort" : `${rows.length} varer ryddet bort`, async () => {
        setToast(null);
        setLocal((prev) => [...prev, ...rows]);
        await restoreShoppingItems(rows).catch(() => setError("Klarte ikke å angre."));
      });
    } catch {
      setLocal((prev) => [...prev, ...removed]);
      setError("Klarte ikke å rydde lista.");
    }
  }

  async function sortWithAi() {
    if (sorting) return;
    setSorting(true);
    setError(null);
    try {
      const res = await sortShoppingList();
      if (res.error) setError(res.error);
    } catch {
      setError("Sortering feilet. Prøv igjen.");
    } finally {
      setSorting(false);
    }
  }

  if (local.length === 0) {
    return (
      <>
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
          <p className="text-3xl" aria-hidden>
            🛒
          </p>
          <p className="mt-2 font-medium">Handlelista er tom</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Skriv en vare over og trykk Enter.</p>
        </div>
        <UndoToast message={toast?.message ?? null} onUndo={() => toast?.undo()} />
      </>
    );
  }

  const groups = groupByStore(annet);

  return (
    <div className="flex flex-col gap-5">
      <p className="-mb-2 px-1 text-sm text-[var(--color-muted)]">
        {toBuy === 0 ? "Alt er kjøpt 🎉" : `${toBuy} igjen å kjøpe`}
        {bought.length > 0 ? ` · ${bought.length} i kurven` : ""}
      </p>

      {dagligvare.length > 0 ? (
        <section aria-labelledby="dagligvare" className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 id="dagligvare" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Dagligvare <span className="font-normal opacity-70">· {dagligvare.length}</span>
            </h2>
            {dagligvare.length > 1 ? (
              <button
                type="button"
                onClick={sortWithAi}
                disabled={sorting}
                className="-mr-2 flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[var(--color-primary)] disabled:opacity-60"
              >
                {sorting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                {sorting ? "Sorterer …" : "Sorter som i butikken"}
              </button>
            ) : null}
          </div>
          <ItemList items={dagligvare} onToggle={cycle} onOpen={setEditing} />
        </section>
      ) : null}

      {groups.map(({ key, display, items: groupItems }) => (
        <section key={key} aria-label={display} className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            <StoreIcon className="h-3.5 w-3.5" aria-hidden />
            {display} <span className="font-normal opacity-70">· {groupItems.length}</span>
          </h2>
          <ItemList items={groupItems} onToggle={cycle} onOpen={setEditing} />
        </section>
      ))}

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {bought.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={clearDone} className="self-center text-[var(--color-muted)]">
          <Eraser className="h-4 w-4" aria-hidden /> Rydd bort kjøpte ({bought.length})
        </Button>
      ) : null}

      <EditSheet
        item={editing}
        onClose={() => setEditing(null)}
        onDelete={remove}
        onSave={async (item, changes) => {
          setEditing(null);
          patch(item.id, changes);
          try {
            const res = await updateShoppingItem(item.id, { ...changes, store: changes.store ?? "" });
            if (res.error) throw new Error(res.error);
          } catch {
            patch(item.id, { name: item.name, category: item.category, store: item.store });
            setError("Klarte ikke å lagre endringen.");
          }
        }}
      />

      <UndoToast message={toast?.message ?? null} onUndo={() => toast?.undo()} />
    </div>
  );
}

function groupByStore(items: ShoppingItem[]) {
  const groups = new Map<string, { display: string; items: ShoppingItem[] }>();
  for (const item of items) {
    const key = (item.store ?? "").trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { display: item.store?.trim() || "Annet", items: [item] });
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "nb")))
    .map(([key, g]) => ({ key, ...g }));
}

function ItemList({
  items,
  onToggle,
  onOpen,
}: {
  items: ShoppingItem[];
  onToggle: (i: ShoppingItem) => void;
  onOpen: (i: ShoppingItem) => void;
}) {
  return (
    <ul className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      {items.map((item) => {
        const bought = item.status === "kjopt";
        return (
          <li key={item.id} className="flex items-center border-b border-[var(--color-border)] pr-3 last:border-b-0">
            <button
              type="button"
              onClick={() => onToggle(item)}
              aria-label={bought ? `${item.name}: marker som ikke kjøpt` : `${item.name}: marker som kjøpt`}
              aria-pressed={bought}
              className="flex h-14 w-14 shrink-0 items-center justify-center"
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
                  bought
                    ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
                    : "border-[var(--color-border)]"
                )}
              >
                {bought ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : null}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onOpen(item)}
              aria-label={`Rediger ${item.name}`}
              className={cn(
                "min-h-14 min-w-0 flex-1 py-2 text-left text-[17px] break-words",
                bought && "text-[var(--color-muted)] line-through"
              )}
            >
              {item.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EditSheet({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: ShoppingItem | null;
  onClose: () => void;
  onSave: (item: ShoppingItem, changes: Pick<ShoppingItem, "name" | "category" | "store">) => void;
  onDelete: (item: ShoppingItem) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ShoppingItem["category"]>("dagligvare");
  const [store, setStore] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  if (item && item.id !== lastId) {
    setLastId(item.id);
    setName(item.name);
    setCategory(item.category);
    setStore(item.store ?? "");
  }

  return (
    <Sheet open={item !== null} onClose={onClose} title="Vare">
      {item ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSave(item, { name: name.trim(), category, store: category === "annet" ? store.trim() || null : null });
          }}
          className="flex flex-col gap-4"
        >
          <Input aria-label="Navn på vare" value={name} onChange={(e) => setName(e.target.value)} />
          <Segmented
            label="Kategori"
            value={category}
            onChange={setCategory}
            options={[
              { value: "dagligvare", label: "Dagligvare" },
              { value: "annet", label: "Annet" },
            ]}
          />
          {category === "annet" ? (
            <Input
              aria-label="Butikk"
              placeholder="Butikk (valgfritt), f.eks. Clas Ohlson"
              value={store}
              onChange={(e) => setStore(e.target.value)}
            />
          ) : null}
          <Button type="submit" size="lg" disabled={!name.trim()}>
            Lagre
          </Button>
          <Button type="button" variant="ghost" className="text-[var(--color-danger)]" onClick={() => onDelete(item)}>
            <Trash2 className="h-4 w-4" aria-hidden /> Fjern fra lista
          </Button>
        </form>
      ) : null}
    </Sheet>
  );
}
