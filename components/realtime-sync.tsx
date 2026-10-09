"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

const TABLES = [
  "events",
  "shopping_items",
  "tasks",
  "messages",
  "documents",
  "people",
  "external_calendars",
];

/**
 * Live-synk mellom telefonene (samme mønster som Hyttekompis): lytter på
 * Supabase Realtime for husstandens tabeller og kaller router.refresh() med
 * 300 ms debounce, så server-rendret data lastes på nytt i bakgrunnen.
 * Krever at tabellene er i publikasjonen supabase_realtime (se migrasjon 0001).
 */
export function RealtimeSync({ householdId }: { householdId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => router.refresh(), 300);
    };

    const channel = supabase.channel(`household-${householdId}`);
    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table, filter: `household_id=eq.${householdId}` },
        refresh
      );
    }
    channel.subscribe();

    // Telefonen har sovet → hent ferske data når appen kommer i forgrunnen igjen.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [householdId, router]);

  return null;
}
