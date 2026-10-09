// Faste innstillinger for appen. Endre navn/steder her — ikke rundt om i koden.

export const APP_NAME = "Familiesamarbeid";
export const APP_TAGLINE = "Oversikt over hverdagen — for oss to";
export const TIME_ZONE = "Europe/Oslo";

/** Steder vi viser vær for på forsiden (met.no). Maks 4 desimaler. */
export const WEATHER_LOCATIONS = [
  { name: "Helsfyr", lat: 59.9127, lng: 10.801 },
  { name: "Hedalen", lat: 60.6225, lng: 9.6907 },
] as const;

export const EVENT_CATEGORIES = [
  { value: "avtale", label: "Avtale", emoji: "📌" },
  { value: "reise", label: "Reise/ferie", emoji: "✈️" },
  { value: "jobb", label: "Jobb/jobbreise", emoji: "💼" },
  { value: "skole", label: "Skole/barnehage", emoji: "🏫" },
  { value: "aktivitet", label: "Aktivitet/fritid", emoji: "⚽" },
  { value: "bursdag", label: "Bursdag/feiring", emoji: "🎂" },
  { value: "annet", label: "Annet", emoji: "🗓️" },
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number]["value"];

export function categoryMeta(value: string) {
  return EVENT_CATEGORIES.find((c) => c.value === value) ?? EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

export const DOCUMENT_CATEGORIES = [
  { value: "skole", label: "Skole/barnehage" },
  { value: "helse", label: "Helse" },
  { value: "reise", label: "Reise" },
  { value: "bolig", label: "Bolig" },
  { value: "okonomi", label: "Økonomi" },
  { value: "annet", label: "Annet" },
] as const;

/** Farger for personer. Alle gir lesbar hvit tekst (kontrast ≥ 4.5:1 for initialer). */
export const PERSON_COLORS = [
  { value: "#2563eb", name: "Blå" },
  { value: "#15803d", name: "Grønn" },
  { value: "#db2777", name: "Rosa" },
  { value: "#b45309", name: "Oransje" },
  { value: "#7c3aed", name: "Lilla" },
  { value: "#0e7490", name: "Turkis" },
  { value: "#dc2626", name: "Rød" },
  { value: "#4b5563", name: "Grå" },
] as const;
