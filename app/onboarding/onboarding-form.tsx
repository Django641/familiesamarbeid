"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { completeOnboarding, type OnboardingState } from "./actions";

export function OnboardingForm({ askChildren, existingChildren }: { askChildren: boolean; existingChildren: string[] }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  const [children, setChildren] = useState<string[]>(["", ""]);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Hva heter du?</Label>
        <Input id="name" name="name" autoComplete="given-name" required autoFocus />
      </div>

      {askChildren ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Barn i familien</legend>
          {children.map((value, i) => (
            <div key={i} className="flex gap-2">
              <Input
                name="child"
                aria-label={`Barn ${i + 1}`}
                placeholder="Navn"
                value={value}
                onChange={(e) => setChildren((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))}
              />
              {children.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Fjern barn ${i + 1}`}
                  onClick={() => setChildren((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setChildren((p) => [...p, ""])}>
            <Plus className="h-4 w-4" aria-hidden /> Ett barn til
          </Button>
        </fieldset>
      ) : existingChildren.length > 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Barna er allerede lagt inn: {existingChildren.join(" og ")}.</p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Lagrer …" : "Kom i gang"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
