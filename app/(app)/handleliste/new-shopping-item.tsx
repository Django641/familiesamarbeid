"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";

import { addShoppingItem } from "./actions";

type Category = "dagligvare" | "annet";

/** Legg til vare: ett felt + Enter. Feltet tømmes med en gang, så man kan skrive neste vare. */
export function NewShoppingItem() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("dagligvare");
  const [store, setStore] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    setName("");
    inputRef.current?.focus();
    const result = await addShoppingItem({ name: trimmed, category, store });
    if (result.error) {
      // Legg teksten tilbake så ingenting forsvinner stille (f.eks. uten nett).
      setName(trimmed);
      setError("Klarte ikke å legge til. Prøv igjen.");
    }
  }

  return (
    <form onSubmit={submit} className="mb-5 flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          aria-label="Ny vare"
          placeholder={category === "dagligvare" ? "Melk, brød, bananer …" : "Lyspærer, gave, maling …"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          enterKeyHint="send"
          autoComplete="off"
        />
        <Button type="submit" size="icon" className="h-12 w-12 shrink-0" aria-label="Legg til vare" disabled={!name.trim()}>
          <Plus className="h-6 w-6" aria-hidden />
        </Button>
      </div>
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
          autoComplete="off"
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
