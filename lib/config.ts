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

export const PERSON_COLORS = [
  "#2563eb",
  "#16a34a",
  "#db2777",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#dc2626",
  "#4b5563",
] as const;
