"use client";

import { useEffect } from "react";

// Registrerer service worker (public/sw.js) — kreves for push-varsler.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ikke kritisk — appen fungerer uten
      });
    }
  }, []);
  return null;
}
