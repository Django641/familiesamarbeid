"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, Copy, RefreshCw } from "lucide-react";

import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Personlig, hemmelig abonnementslenke (ICS) som legger familiekalenderen inn i
 * Outlook (jobb), Google Kalender og iPhone-kalenderen. Endringer kommer automatisk,
 * men Google/Outlook oppdaterer bare med noen timers mellomrom.
 */
export function CalendarFeed({
  householdId,
  userId,
  token,
  appUrl,
}: {
  householdId: string;
  userId: string;
  token: string | null;
  appUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin = appUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const httpsUrl = token ? `${origin}/api/ics/${token}.ics` : null;
  const webcalUrl = httpsUrl?.replace(/^https?:\/\//, "webcal://") ?? null;

  async function create(rotate: boolean) {
    if (rotate && !window.confirm("Lage ny lenke? Den gamle slutter å virke, og du må abonnere på nytt.")) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // Ved ny lenke byttes tokenet på samme rad, så man aldri står helt uten lenke.
    const { error: dbError } = rotate
      ? await supabase.from("calendar_feeds").update({ token: randomToken() }).eq("user_id", userId)
      : await supabase.from("calendar_feeds").insert({ household_id: householdId, user_id: userId });
    setBusy(false);
    if (dbError) setError("Klarte ikke å lage lenke. Prøv igjen.");
    router.refresh();
  }

  async function copy() {
    if (!httpsUrl) return;
    await navigator.clipboard.writeText(httpsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Familiekalenderen i Outlook / Google / iPhone</CardTitle>
        <p className="text-xs text-[var(--color-muted)]">
          Abonner én gang, så dukker alle hendelser opp i kalenderen du bruker til vanlig — også jobb-Outlook.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!httpsUrl ? (
          <Button onClick={() => create(false)} disabled={busy}>
            <CalendarPlus className="h-4 w-4" aria-hidden /> Lag min abonnementslenke
          </Button>
        ) : (
          <>
            <a href={webcalUrl!} className={buttonClass("default")}>
              <CalendarPlus className="h-4 w-4" aria-hidden /> Abonner på iPhone/Mac
            </a>
            <Button variant="outline" onClick={copy}>
              <Copy className="h-4 w-4" aria-hidden /> {copied ? "Kopiert!" : "Kopier lenke (Outlook/Google)"}
            </Button>
            <details className="text-xs text-[var(--color-muted)]">
              <summary className="min-h-11 cursor-pointer py-3">Slik legger du den inn</summary>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Outlook:</strong> Kalender → Legg til kalender → Abonner fra nettet → lim inn lenken.
                </li>
                <li>
                  <strong>Google:</strong> calendar.google.com på PC → «Andre kalendere» + → Fra URL.
                </li>
                <li>Google og Outlook henter endringer med noen timers mellomrom — appen er alltid ferskest.</li>
                <li>Lenken er hemmelig. Del den ikke videre.</li>
              </ul>
            </details>
            <Button variant="ghost" size="sm" onClick={() => create(true)} disabled={busy}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Lag ny lenke (sperr den gamle)
            </Button>
          </>
        )}
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
