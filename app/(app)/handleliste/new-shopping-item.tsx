"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notifyHousehold } from "@/lib/push-client";
import { placeShoppingItem } from "@/lib/shopping-client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Category = "dagligvare" | "annet";

export function NewShoppingItem({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("dagligvare");
  const [store, setStore] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("shopping_items")
      .insert({
        household_id: householdId,
        name: trimmed,
        category,
        store: category === "annet" ? store.trim() || null : null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (!error) {
      notifyHousehold(`la til «${trimmed}» på handlelista`, "/handleliste", "shopping");
      if (category === "dagligvare" && data) {
        placeShoppingItem(data.id);
      }
    }
    setName("");
    setStore("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mb-4 flex flex-col gap-2">
      <Input
        placeholder="Legg til vare …"
        value={name}
        onChange={(e) => setName(e.target.value)}
        enterKeyHint="send"
      />
      <div role="radiogroup" className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-bg)] p-1">
        {(["dagligvare", "annet"] as Category[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "h-10 rounded-lg text-sm font-medium transition-colors",
              category === c
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                : "text-[var(--color-muted)]"
            )}
          >
            {c === "dagligvare" ? "Dagligvare" : "Annet"}
          </button>
        ))}
      </div>
      {category === "annet" ? (
        <Input
          placeholder="Butikk (valgfri, f.eks. Clas Ohlson)"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          autoComplete="off"
        />
      ) : null}
      <Button type="submit" disabled={saving || !name.trim()}>
        Legg til
      </Button>
    </form>
  );
}
