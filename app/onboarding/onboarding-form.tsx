"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { createClient } from "@/lib/supabase/client";

type Mode = "create" | "join";

export function OnboardingForm({ defaultName, defaultCode }: { defaultName: string; defaultCode: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(defaultCode ? "join" : "create");
  const [displayName, setDisplayName] = useState(defaultName);
  const [householdName, setHouseholdName] = useState("Familien");
  const [children, setChildren] = useState<string[]>([""]);
  const [code, setCode] = useState(defaultCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setError("Skriv navnet ditt.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } =
      mode === "create"
        ? await supabase.rpc("create_household_with_owner", {
            p_name: householdName.trim() || "Familien",
            p_display_name: name,
            p_children: children.map((c) => c.trim()).filter(Boolean),
          })
        : await supabase.rpc("join_household_by_code", {
            p_code: code.trim().toUpperCase(),
            p_display_name: name,
          });
    setBusy(false);
    if (rpcError) {
      setError(
        rpcError.message.includes("Ugyldig") ? "Fant ingen familie med den koden." : "Noe gikk galt. Prøv igjen."
      );
      return;
    }
    router.replace("/hjem");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Segmented
        label="Velg oppstart"
        value={mode}
        onChange={setMode}
        options={[
          { value: "create", label: "Ny familie" },
          { value: "join", label: "Har en kode" },
        ]}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="display-name">Ditt navn</Label>
        <Input
          id="display-name"
          autoComplete="given-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="F.eks. Kjetil"
        />
      </div>

      {mode === "create" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="household-name">Navn på familien</Label>
            <Input
              id="household-name"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Barn (valgfritt)</legend>
            {children.map((child, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  aria-label={`Barn ${i + 1}`}
                  value={child}
                  onChange={(e) => setChildren((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))}
                  placeholder="Navn"
                />
                {children.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Fjern barn ${i + 1}`}
                    onClick={() => setChildren((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setChildren((p) => [...p, ""])}>
              <Plus className="h-4 w-4" aria-hidden /> Legg til barn
            </Button>
          </fieldset>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Invitasjonskode</Label>
          <Input
            id="code"
            autoCapitalize="characters"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6 tegn"
          />
        </div>
      )}

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Lagrer …" : mode === "create" ? "Opprett familie" : "Bli med"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
