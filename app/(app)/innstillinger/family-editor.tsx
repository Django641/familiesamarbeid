"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PERSON_COLORS } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Familiemedlemmer: navn og farge (brukes i kalender og gjøremål). Barn kan legges til/fjernes. */
export function FamilyEditor({ householdId, people }: { householdId: string; people: Person[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function update(id: string, changes: Partial<Person>) {
    const { error: dbError } = await createClient().from("people").update(changes).eq("id", id);
    if (dbError) setError("Klarte ikke å lagre.");
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const used = new Set(people.map((p) => p.color));
    const color = (PERSON_COLORS.find((c) => !used.has(c.value)) ?? PERSON_COLORS[people.length % PERSON_COLORS.length]).value;
    const { error: dbError } = await createClient()
      .from("people")
      .insert({ household_id: householdId, name, kind: "barn", color, position: 10 + people.length });
    if (dbError) setError("Klarte ikke å legge til.");
    setNewName("");
    router.refresh();
  }

  async function remove(p: Person) {
    if (!window.confirm(`Fjerne ${p.name}? Hendelser beholdes, men uten ${p.name} som deltaker.`)) return;
    const { error: dbError } = await createClient().from("people").delete().eq("id", p.id);
    if (dbError) setError("Klarte ikke å fjerne.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Familien</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-3">
          {people.map((p) => (
            <li key={p.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Navn på ${p.name}`}
                  defaultValue={p.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== p.name) update(p.id, { name });
                  }}
                />
                {p.kind === "barn" ? (
                  <Button variant="ghost" size="icon" aria-label={`Fjern ${p.name}`} onClick={() => remove(p)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
              <div role="radiogroup" aria-label={`Farge for ${p.name}`} className="flex flex-wrap gap-1">
                {PERSON_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={p.color === c.value}
                    aria-label={c.name}
                    onClick={() => update(p.id, { color: c.value })}
                    className={cn(
                      "h-11 w-11 rounded-full border-4",
                      p.color === c.value ? "border-[var(--color-text)]" : "border-transparent"
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="flex gap-2">
          <Input
            aria-label="Nytt familiemedlem"
            placeholder="Legg til barn …"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" size="icon" aria-label="Legg til" disabled={!newName.trim()}>
            <Plus className="h-5 w-5" aria-hidden />
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
