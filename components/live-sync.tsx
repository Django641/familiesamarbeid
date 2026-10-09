"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 5000;

/**
 * Live-synk mellom telefonene: spør /api/sync om databasens versjonsteller hvert
 * 5. sekund mens appen er synlig, og henter nye data (router.refresh) når den har
 * endret seg. Ingen ekstern tjeneste — og databasen får sove når appen er lukket.
 */
export function LiveSync() {
  const router = useRouter();

  useEffect(() => {
    let last: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        if (res.ok) {
          const { version } = (await res.json()) as { version: number };
          if (last !== null && version !== last) router.refresh();
          last = version;
        }
      } catch {
        // nettverksfeil — prøv igjen neste runde
      }
    }

    function loop() {
      if (stopped) return;
      timer = setTimeout(async () => {
        await check();
        loop();
      }, INTERVAL_MS);
    }

    function onVisible() {
      if (document.visibilityState === "visible") check();
    }

    check();
    loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
