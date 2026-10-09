"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { formatDateTime } from "@/lib/utils";

type Passkey = { id: string; name?: string | null; createdAt?: Date | string | null };

/** Face ID / Touch ID (passkeys): logg inn uten passord på denne enheten. */
export function PasskeyCard() {
  const [keys, setKeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { data } = await authClient.passkey.listUserPasskeys();
    setKeys((data as Passkey[] | null) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setBusy(true);
    setMessage(null);
    const isIphone = /iphone|ipad/i.test(navigator.userAgent);
    const { error } = await authClient.passkey.addPasskey({ name: isIphone ? "iPhone" : "Denne enheten" });
    setBusy(false);
    if (error) setMessage("Ble ikke lagret. Prøv igjen, og godkjenn med Face ID når telefonen spør.");
    else {
      setMessage("Klart! Neste gang kan du logge inn med Face ID.");
      void load();
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Fjerne Face ID-innlogging for denne nøkkelen?")) return;
    await authClient.passkey.deletePasskey({ id });
    void load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Face ID</CardTitle>
        <p className="text-xs text-[var(--color-muted)]">Logg inn med ansiktet i stedet for passord.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {keys && keys.length > 0 ? (
          <ul className="flex flex-col">
            {keys.map((k) => (
              <li key={k.id} className="flex min-h-12 items-center gap-3">
                <Fingerprint className="h-5 w-5 text-[var(--color-success)]" aria-hidden />
                <span className="flex-1 text-sm">
                  {k.name ?? "Nøkkel"}
                  {k.createdAt ? <span className="text-[var(--color-muted)]"> · {formatDateTime(String(k.createdAt))}</span> : null}
                </span>
                <Button variant="ghost" size="icon" aria-label="Fjern nøkkel" onClick={() => remove(k.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <Button variant={keys && keys.length > 0 ? "outline" : "default"} onClick={add} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Fingerprint className="h-4 w-4" aria-hidden />}
          {keys && keys.length > 0 ? "Legg til på en annen enhet" : "Slå på Face ID på denne telefonen"}
        </Button>
        {message ? <p className="text-sm text-[var(--color-muted)]">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
