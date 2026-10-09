// Værmelding fra met.no (Locationforecast 2.0 compact).
// Gratis og uten API-nøkkel, men krever identifiserende User-Agent.
// Svar caches i 30 min via Next fetch-cache — godt innenfor met.no sine vilkår.

type MetTimeseriesEntry = {
  time: string;
  data: {
    instant: { details: { air_temperature?: number } };
    next_1_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
    next_6_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
    next_12_hours?: { summary?: { symbol_code?: string } };
  };
};

export type DayForecast = {
  label: string; // "I dag", "I morgen", "Lørdag"
  emoji: string;
  min: number;
  max: number;
  precipitation: number; // mm
};

function symbolEmoji(symbolCode: string | undefined): string {
  if (!symbolCode) return "🌡️";
  const code = symbolCode.replace(/_(day|night|polartwilight)$/, "");
  if (code.includes("thunder")) return "⛈️";
  if (code.includes("sleet")) return "🌨️";
  if (code.includes("snow")) return "❄️";
  if (code.includes("rain")) return "🌧️";
  if (code === "fog") return "🌫️";
  if (code === "cloudy") return "☁️";
  if (code === "partlycloudy") return "⛅";
  if (code === "fair") return "🌤️";
  if (code === "clearsky") return "☀️";
  return "🌡️";
}

function osloDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }); // YYYY-MM-DD
}

function osloHour(iso: string): number {
  return Number(
    new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hour12: false })
  );
}

function dayLabel(date: string, todayDate: string): string {
  if (date === todayDate) return "I dag";
  const diff = (new Date(date).getTime() - new Date(todayDate).getTime()) / 86_400_000;
  if (Math.round(diff) === 1) return "I morgen";
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("nb-NO", { weekday: "long" });
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

/** Henter 3-dagers værmelding. Returnerer null ved feil (UI viser da ingenting). */
export async function getForecast(lat: number, lng: number): Promise<DayForecast[] | null> {
  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Familiesamarbeid/1.0 github.com/Django641/familiesamarbeid" },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      properties?: { timeseries?: MetTimeseriesEntry[] };
    };
    const series = json.properties?.timeseries ?? [];
    if (series.length === 0) return null;

    const todayDate = osloDate(series[0].time);

    type Bucket = {
      min: number;
      max: number;
      precipitation: number;
      symbols: Map<number, string>; // time på døgnet → symbol
    };
    const buckets = new Map<string, Bucket>();

    for (const entry of series) {
      const date = osloDate(entry.time);
      const hour = osloHour(entry.time);
      let bucket = buckets.get(date);
      if (!bucket) {
        bucket = { min: Infinity, max: -Infinity, precipitation: 0, symbols: new Map() };
        buckets.set(date, bucket);
      }

      const temp = entry.data.instant.details.air_temperature;
      if (typeof temp === "number") {
        bucket.min = Math.min(bucket.min, temp);
        bucket.max = Math.max(bucket.max, temp);
      }

      // Nedbør: timesvis der det finnes (nærmeste døgn), ellers 6-timers-steg.
      const oneHour = entry.data.next_1_hours?.details?.precipitation_amount;
      if (typeof oneHour === "number") {
        bucket.precipitation += oneHour;
      } else if (hour % 6 === 0) {
        bucket.precipitation += entry.data.next_6_hours?.details?.precipitation_amount ?? 0;
      }

      const symbol =
        entry.data.next_6_hours?.summary?.symbol_code ??
        entry.data.next_12_hours?.summary?.symbol_code ??
        entry.data.next_1_hours?.summary?.symbol_code;
      if (symbol && !bucket.symbols.has(hour)) bucket.symbols.set(hour, symbol);
    }

    const days = Array.from(buckets.entries())
      .filter(([, b]) => b.min !== Infinity)
      .slice(0, 3);

    return days.map(([date, b]) => {
      // Symbol fra midt på dagen hvis mulig, ellers første tilgjengelige.
      const symbol =
        b.symbols.get(12) ?? b.symbols.get(6) ?? b.symbols.values().next().value;
      return {
        label: dayLabel(date, todayDate),
        emoji: symbolEmoji(symbol),
        min: Math.round(b.min),
        max: Math.round(b.max),
        precipitation: Math.round(b.precipitation * 10) / 10,
      };
    });
  } catch {
    return null;
  }
}
