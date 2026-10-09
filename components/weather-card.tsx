import { Card, CardContent } from "@/components/ui/card";
import type { DayForecast } from "@/lib/weather";

/** Kompakt værtabell: én rad per sted, tre dager. Data fra met.no. */
export function WeatherCard({ rows }: { rows: Array<{ name: string; forecast: DayForecast[] }> }) {
  const withData = rows.filter((r) => r.forecast.length > 0);
  if (withData.length === 0) return null;
  const labels = withData[0].forecast.map((d) => d.label);

  return (
    <Card>
      <CardContent className="p-3">
        <table className="w-full table-fixed text-center text-sm">
          <caption className="sr-only">Værmelding</caption>
          <thead>
            <tr className="text-xs text-[var(--color-muted)]">
              <th scope="col" className="w-[28%] pb-1 text-left font-normal">
                <span className="sr-only">Sted</span>
              </th>
              {labels.map((l) => (
                <th key={l} scope="col" className="pb-1 font-normal">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withData.map((row) => (
              <tr key={row.name}>
                <th scope="row" className="py-1 text-left text-sm font-medium">
                  {row.name}
                </th>
                {row.forecast.map((d) => (
                  <td key={d.label} className="py-1">
                    <span className="mr-1 text-lg" aria-hidden>
                      {d.emoji}
                    </span>
                    <span className="font-semibold tabular-nums">{d.max}°</span>
                    <span className="text-xs text-[var(--color-muted)] tabular-nums">/{d.min}°</span>
                    {d.precipitation > 0 ? (
                      <span className="block text-[11px] text-[var(--color-muted)] tabular-nums">{d.precipitation} mm</span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-center text-[10px] text-[var(--color-muted)]">Værdata fra Meteorologisk institutt</p>
      </CardContent>
    </Card>
  );
}
