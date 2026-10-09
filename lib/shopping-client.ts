// Klient-hjelpere for handlelista.

/**
 * Ber serveren auto-plassere en nyinnlagt dagligvare i butikk-rekkefølgen
 * (no-op hvis lista ikke er AI-sortert). Fire-and-forget — plasseringen
 * dukker opp via realtime/refresh når den er klar, og feil ignoreres stille.
 */
export function placeShoppingItem(itemId: string) {
  try {
    fetch("/api/sort-shopping/place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignorer
  }
}
