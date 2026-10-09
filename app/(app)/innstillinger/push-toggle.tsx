"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { urlBase64ToUint8Array } from "@/lib/push-client";

type PushState =
  | "loading" // sjekker støtte/eksisterende abonnement
  | "unsupported" // nettleseren støtter ikke push
  | "ios_needs_install" // iOS: må legges på Hjem-skjerm først
  | "denied" // bruker har blokkert varsler
  | "off"
  | "on"
  | "working"; // holder på å skru av/på

export function PushToggle({ householdId, userId }: { householdId: string; userId: string }) {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    async function check() {
      if (!vapidKey) {
        setState("unsupported");
        return;
      }
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        // iOS Safari uten hjemskjerm-installasjon mangler PushManager
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        setState(isIos && !standalone ? "ios_needs_install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setState(subscription ? "on" : "off");
      } catch {
        setState("off");
      }
    }
    check();
  }, [vapidKey]);

  async function enable() {
    if (!vapidKey) return;
    setState("working");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Ufullstendig abonnement");
      }
      const supabase = createClient();
      const { error: dbError } = await supabase.from("push_subscriptions").upsert(
        {
          household_id: householdId,
          user_id: userId,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: "endpoint" }
      );
      if (dbError) throw dbError;
      setState("on");
    } catch {
      setError("Klarte ikke å aktivere varsler. Prøv igjen.");
      setState("off");
    }
  }

  async function disable() {
    setState("working");
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const supabase = createClient();
        await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Klarte ikke å skru av. Prøv igjen.");
      setState("on");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Push-varsler</CardTitle>
        <p className="text-xs text-[var(--color-muted)]">
          Få beskjed på denne telefonen når den andre legger inn noe nytt.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {state === "loading" ? (
          <p className="text-sm text-[var(--color-muted)]">Sjekker …</p>
        ) : state === "ios_needs_install" ? (
          <p className="text-sm text-[var(--color-muted)]">
            På iPhone må appen først legges på Hjem-skjermen: trykk <strong>Del</strong> i Safari →{" "}
            <strong>Legg til på Hjem-skjerm</strong>, og åpne appen derfra.
          </p>
        ) : state === "unsupported" ? (
          <p className="text-sm text-[var(--color-muted)]">
            Denne nettleseren støtter ikke push-varsler.
          </p>
        ) : state === "denied" ? (
          <p className="text-sm text-[var(--color-muted)]">
            Varsler er blokkert for appen. Åpne nettleserens innstillinger for å tillate dem
            igjen.
          </p>
        ) : (
          <button
            type="button"
            onClick={state === "on" ? disable : enable}
            disabled={state === "working"}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)] disabled:opacity-60"
          >
            {state === "working" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : state === "on" ? (
              <BellOff className="h-4 w-4" aria-hidden />
            ) : (
              <Bell className="h-4 w-4" aria-hidden />
            )}
            {state === "on" ? "Skru av varsler på denne enheten" : "Aktiver varsler på denne enheten"}
          </button>
        )}
        {state === "on" ? (
          <p className="text-xs text-[var(--color-success)]">✓ Varsler er på for denne enheten.</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
