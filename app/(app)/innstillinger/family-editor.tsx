"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PERSON_COLORS } from "@/lib/config";
import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";

import { addChild, removeChild, updatePerson } from "./actions";

/** Familiemedlemmer: navn, farge og kjennetegn (brukes i kalender, gjøremål og AI-tolkning). */
export function FamilyEditor({ people, meId }: { people: Person[]; meId: string }) {
  const [editing, setEditing] = useState<Person | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    const res = await addChild(name).catch(() => ({ error: "Klarte ikke å legge til." }));
    if (res.error) setError(res.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Familien</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul className="flex flex-col">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1 text-left hover:bg-[var(--color-bg)]"
              >
                <Avatar person={p} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {p.name}
                    {p.id === meId ? <span className="font-normal text-[var(--color-muted)]"> (deg)</span> : null}
                  </span>
                  {p.hints ? (
                    <span aria-hidden className="block truncate text-xs text-[var(--color-muted)]">
                      {p.hints}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-[var(--color-muted)]">{p.kind === "barn" ? "Barn" : "Voksen"}</span>
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="flex gap-2">
          <Input aria-label="Legg til barn" placeholder="Legg til barn …" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button type="submit" size="icon" className="h-12 w-12 shrink-0" aria-label="Legg til" disabled={!newName.trim()}>
            <Plus className="h-5 w-5" aria-hidden />
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
      </CardContent>

      <PersonSheet person={editing} onClose={() => setEditing(null)} onError={setError} />
    </Card>
  );
}

function PersonSheet({ person, onClose, onError }: { person: Person | null; onClose: () => void; onError: (e: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [hints, setHints] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  if (!person && lastId !== null) setLastId(null);
  if (person && person.id !== lastId) {
    setLastId(person.id);
    setName(person.name);
    setColor(person.color);
    setHints(person.hints);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!person) return;
    onClose();
    const res = await updatePerson(person.id, { name: name.trim(), color, hints: hints.trim() }).catch(() => ({ error: "Klarte ikke å lagre." }));
    if (res.error) onError(res.error);
  }

  async function remove() {
    if (!person || !window.confirm(`Fjerne ${person.name}? Hendelser beholdes, men uten ${person.name}.`)) return;
    onClose();
    const res = await removeChild(person.id).catch(() => ({ error: "Klarte ikke å fjerne." }));
    if (res.error) onError(res.error);
  }

  return (
    <Sheet open={person !== null} onClose={onClose} title={person?.name ?? ""}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Input aria-label="Navn" value={name} onChange={(e) => setName(e.target.value)} />
        <div role="radiogroup" aria-label="Farge" className="flex flex-wrap gap-2">
          {PERSON_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color === c.value}
              aria-label={c.name}
              onClick={() => setColor(c.value)}
              className={cn("h-11 w-11 rounded-full ring-offset-2 ring-offset-[var(--color-surface)]", color === c.value && "ring-4 ring-[var(--color-text)]")}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hints">Kjennetegn</Label>
          <Textarea
            id="hints"
            rows={3}
            maxLength={300}
            value={hints}
            onChange={(e) => setHints(e.target.value)}
            aria-describedby="hints-help"
            placeholder={
              person?.kind === "barn"
                ? "F.eks. født 2017, 4B på Tøyen skole, AKS, fotball Lille Tøyen J2017"
                : "F.eks. jobber på …, reiser ofte til Bergen, kor på onsdager"
            }
          />
          <p id="hints-help" className="text-xs text-[var(--color-muted)]">
            Hjelper Claude å skjønne hvem en beskjed gjelder (klasse, lag, skole, jobb). Fødselsår gjør at klassetrinnet
            stemmer også neste skoleår.
          </p>
        </div>
        <Button type="submit" size="lg" disabled={!name.trim()}>
          Lagre
        </Button>
        {person?.kind === "barn" ? (
          <Button type="button" variant="ghost" className="text-[var(--color-danger)]" onClick={remove}>
            <Trash2 className="h-4 w-4" aria-hidden /> Fjern fra familien
          </Button>
        ) : null}
      </form>
    </Sheet>
  );
}
