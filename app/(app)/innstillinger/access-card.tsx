"use client";

import { useState } from "react";
import { KeyRound, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { setPartnerPassword } from "./actions";

/** Tilgang: hvem som kan lage konto, og nytt passord for den andre voksne. */
export function AccessCard({
  appUrl,
  pending,
  partner,
}: {
  appUrl: string;
  pending: string[];
  partner: { id: string; name: string } | null;
}) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    const url = appUrl || window.location.origin;
    const text = `Logg inn på familieappen: ${url} — velg «Første gang» og lag konto med e-posten din.`;
    if (navigator.share) await navigator.share({ text }).catch(() => {});
    else await navigator.clipboard.writeText(text).catch(() => {});
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    if (!partner) return;
    setBusy(true);
    const res = await setPartnerPassword(partner.id, password).catch(() => ({ error: "Noe gikk galt." }));
    setBusy(false);
    setMessage(res.error ?? `Nytt passord er satt for ${partner.name}. Gi det til hen muntlig.`);
    if (!res.error) setPassword("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tilgang</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pending.length > 0 ? (
          <>
            <p className="text-sm">
              Venter på konto fra <strong>{pending.join(", ")}</strong>. Send lenken — hen velger «Første gang» og lager
              konto med den e-posten.
            </p>
            <Button onClick={share}>
              <Share2 className="h-4 w-4" aria-hidden /> Del lenke til appen
            </Button>
          </>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Bare e-postene i miljøvariabelen <code>ALLOWED_EMAILS</code> (i Vercel) kan lage konto.
          </p>
        )}

        {partner ? (
          <details className="text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
              <KeyRound className="h-4 w-4" aria-hidden /> Har {partner.name} glemt passordet?
            </summary>
            <form onSubmit={reset} className="mt-2 flex flex-col gap-2">
              <Input
                type="text"
                autoComplete="off"
                aria-label={`Nytt passord for ${partner.name}`}
                placeholder="Nytt passord (minst 8 tegn)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
              />
              <Button type="submit" variant="outline" disabled={busy || password.length < 8}>
                Sett nytt passord
              </Button>
            </form>
          </details>
        ) : null}
        {message ? <p className="text-sm text-[var(--color-muted)]">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
