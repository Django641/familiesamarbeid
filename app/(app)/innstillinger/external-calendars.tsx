"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { PersonPicker } from "@/components/person-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EVENT_CATEGORIES } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import type { ExternalCalendar, Person } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

/**
 * Importer kalendere via iCal-lenke (f.eks. en Google-kalender som Spond synker
 * til, skolens kalender eller en jobbkalender). Synkes hver halvtime av Vercel Cron.
 */
export function ExternalCalendars({
  householdId,
  people,
  calendars,
}: {
  householdId: string;
  people: Person[];
  calendars: ExternalCalendar[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("aktivitet");
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncNow() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/calendars/sync", { method: "POST" });
      const data = (await res.json()) as { results?: Array<{ ok: boolean; count: number; error?: string }>; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Synk feilet");
      const total = data.results?.reduce((sum, r) => sum + r.count, 0) ?? 0;
      const failed = data.results?.filter((r) => !r.ok).length ?? 0;
      setMessage(failed ? `${failed} kalender(e) feilet — se under.` : `Ferdig: ${total} hendelser oppdatert.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Synk feilet");
    } finally {
      setSyncing(false);
      router.refresh();
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !/^(https?|webcal):\/\//i.test(url.trim())) {
      setMessage("Gi kalenderen et navn og lim inn en lenke som starter med https:// eller webcal://");
      return;
    }
    const { error } = await createClient().from("external_calendars").insert({
      household_id: householdId,
      name: name.trim(),
      url: url.trim(),
      category,
      person_ids: personIds,
    });
    if (error) {
      setMessage("Klarte ikke å lagre.");
      return;
    }
    setAdding(false);
    setName("");
    setUrl("");
    setPersonIds([]);
    await syncNow();
  }

  async function remove(cal: ExternalCalendar) {
    if (!window.confirm(`Fjerne «${cal.name}»? Importerte hendelser fra den slettes også.`)) return;
    await createClient().from("external_calendars").delete().eq("id", cal.id);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Importer kalendere (Spond, skole …)</CardTitle>
        <p className="text-xs text-[var(--color-muted)]">
          Lim inn en iCal-lenke. Oppdateres automatisk hver halvtime.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {calendars.map((cal) => (
          <div key={cal.id} className="flex items-start gap-2 rounded-xl border border-[var(--color-border)] p-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{cal.name}</p>
              <p className="text-xs text-[var(--color-muted)]">
                {cal.last_synced_at ? `Synket ${formatDateTime(cal.last_synced_at)}` : "Ikke synket ennå"}
              </p>
              {cal.last_error ? <p className="text-xs text-[var(--color-danger)]">Feil: {cal.last_error}</p> : null}
            </div>
            <Button variant="ghost" size="icon" aria-label={`Fjern ${cal.name}`} onClick={() => remove(cal)}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}

        {adding ? (
          <form onSubmit={add} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cal-name">Navn</Label>
              <Input id="cal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="F.eks. Spond – Ada" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cal-url">iCal-lenke</Label>
              <Input
                id="cal-url"
                inputMode="url"
                autoComplete="off"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://calendar.google.com/…/basic.ics"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cal-cat">Type hendelser</Label>
              <Select id="cal-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <PersonPicker people={people} value={personIds} onChange={setPersonIds} label="Gjelder" />
            <div className="grid grid-cols-2 gap-2">
              <Button type="submit">Lagre</Button>
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                Avbryt
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Legg til
            </Button>
            <Button variant="outline" onClick={syncNow} disabled={syncing || calendars.length === 0}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              Synk nå
            </Button>
          </div>
        )}
        {message ? <p className="text-sm text-[var(--color-muted)]">{message}</p> : null}

        <details className="text-xs text-[var(--color-muted)]">
          <summary className="min-h-11 cursor-pointer py-3">Slik får du Spond inn her</summary>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Spond har ingen egen kalenderlenke, men kan synke til kalenderen på telefonen.</li>
            <li>
              Lag en egen Google-kalender «Barna» (calendar.google.com → Andre kalendere → Opprett ny kalender).
            </li>
            <li>
              I Spond-appen: finn «Kalendersynkronisering» i innstillingene og velg «Barna». (På iPhone må Google-kontoen
              være lagt til i Kalender-appen først.)
            </li>
            <li>
              I Google Kalender på PC: Innstillinger for «Barna» → «Hemmelig adresse i iCal-format» → kopier og lim inn
              her.
            </li>
          </ol>
        </details>
      </CardContent>
    </Card>
  );
}
