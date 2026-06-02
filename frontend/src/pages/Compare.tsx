import { useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { ExternalLink, GitCompare } from "lucide-react";
import { api, type Car } from "../api/client";

const ROWS: { label: string; key: keyof Car; format?: (v: unknown) => string }[] = [
  { label: "Merke", key: "brand", format: (v) => String(v ?? "–") },
  { label: "Modell", key: "model", format: (v) => String(v ?? "–") },
  { label: "År", key: "year", format: (v) => String(v ?? "–") },
  { label: "Km", key: "mileage", format: (v) => v != null ? `${Number(v).toLocaleString("no")} km` : "–" },
  { label: "Pris", key: "price", format: (v) => v != null ? `${Number(v).toLocaleString("no")} kr` : "–" },
  { label: "Drivstoff", key: "fuel_type", format: (v) => String(v ?? "–") },
  { label: "Girkasse", key: "transmission", format: (v) => String(v ?? "–") },
  { label: "Drivlinje", key: "drivetrain", format: (v) => String(v ?? "–") },
  { label: "Farge", key: "color", format: (v) => String(v ?? "–") },
  { label: "Selger", key: "seller_type", format: (v) => String(v ?? "–") },
  { label: "EU-kontroll", key: "eu_next_deadline", format: (v) => v ? String(v).slice(0, 10) : "–" },
  { label: "Norsk reg.", key: "is_norwegian_reg", format: (v) => v === true ? "Ja" : v === false ? "Nei" : "–" },
  { label: "Antall eiere", key: "num_owners", format: (v) => String(v ?? "–") },
  { label: "Heftelse", key: "has_lien", format: (v) => v === true ? "Ja" : v === false ? "Nei" : "–" },
];

function numericValue(car: Car, key: keyof Car): number | null {
  const v = car[key];
  return typeof v === "number" ? v : null;
}

function bestIndexForNumericRow(cars: Car[], key: keyof Car, lowerIsBetter: boolean): number | null {
  const values = cars.map((c) => numericValue(c, key));
  if (values.every((v) => v === null)) return null;
  let bestIdx = -1;
  let bestVal: number | null = null;
  values.forEach((v, i) => {
    if (v === null) return;
    if (bestVal === null || (lowerIsBetter ? v < bestVal : v > bestVal)) {
      bestVal = v;
      bestIdx = i;
    }
  });
  return bestIdx === -1 ? null : bestIdx;
}

export default function Compare() {
  const [searchParams] = useSearchParams();
  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["car", id],
      queryFn: () => api.getCar(id),
    })),
  });

  if (ids.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <GitCompare size={40} className="text-slate-600 mx-auto" />
        <p className="text-slate-400">Ingen biler å sammenligne.</p>
        <p className="text-slate-500 text-sm">Legg til biler ved å trykke «+» på en annonse.</p>
      </div>
    );
  }

  const loading = results.some((r) => r.isLoading);
  const cars = results.map((r) => r.data).filter(Boolean) as Car[];

  if (loading) return <p className="text-slate-400">Laster…</p>;

  const NUMERIC_ROWS: Partial<Record<keyof Car, boolean>> = {
    price: true,   // lower is better
    mileage: true, // lower is better
    year: false,   // higher is better
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
        <GitCompare size={20} className="text-amber-400" />
        Sammenlign biler
      </h1>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 w-32">Egenskap</th>
              {cars.map((car) => (
                <th key={car.id} className="px-4 py-3 text-left min-w-[160px]">
                  <a href={car.url} target="_blank" rel="noreferrer"
                    className="font-semibold text-amber-400 hover:underline flex items-center gap-1">
                    {car.brand} {car.model}
                    <ExternalLink size={12} className="shrink-0" />
                  </a>
                  <p className="text-xs text-slate-500 font-normal mt-0.5">{car.year} · {car.title}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ label, key, format }) => {
              const lowerIsBetter = NUMERIC_ROWS[key] === true;
              const higherIsBetter = NUMERIC_ROWS[key] === false;
              const bestIdx = key in NUMERIC_ROWS
                ? bestIndexForNumericRow(cars, key, lowerIsBetter || !higherIsBetter)
                : null;

              return (
                <tr key={key} className="border-b border-slate-700/50 hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 text-xs font-medium text-slate-400 whitespace-nowrap">{label}</td>
                  {cars.map((car, i) => {
                    const isBest = bestIdx === i;
                    return (
                      <td key={car.id}
                        className={`px-4 py-2.5 text-sm ${isBest ? "bg-green-900/20 text-green-300 font-semibold" : "text-slate-200"}`}>
                        {format ? format(car[key]) : String(car[key] ?? "–")}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Monthly cost row */}
            <tr className="border-b border-slate-700/50 hover:bg-slate-800/50">
              <td className="px-4 py-2.5 text-xs font-medium text-slate-400 whitespace-nowrap">Månedskostnad</td>
              {cars.map((car, i) => {
                const monthly = car.price ? Math.round(car.price / 60) : null;
                const allMonthly = cars.map((c) => c.price ? Math.round(c.price / 60) : null);
                const minMonthly = Math.min(...allMonthly.filter((v): v is number => v !== null));
                const isBest = monthly !== null && monthly === minMonthly;
                return (
                  <td key={car.id}
                    className={`px-4 py-2.5 text-sm ${isBest ? "bg-green-900/20 text-green-300 font-semibold" : "text-slate-200"}`}>
                    {monthly ? `~${monthly.toLocaleString("no")} kr/mnd` : "–"}
                  </td>
                );
              })}
            </tr>

            {/* Score row */}
            <tr className="border-b border-slate-700/50 hover:bg-slate-800/50">
              <td className="px-4 py-2.5 text-xs font-medium text-slate-400 whitespace-nowrap">Score</td>
              {cars.map((car) => (
                <td key={car.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {(car.score_chips ?? []).map((c, i) => {
                      const cls = c.type === "green" ? "bg-green-900/50 text-green-400" :
                                  c.type === "red"   ? "bg-red-900/50 text-red-400" :
                                                       "bg-slate-700 text-slate-400";
                      return <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{c.label}</span>;
                    })}
                    {(!car.score_chips || car.score_chips.length === 0) && <span className="text-slate-500 text-xs">–</span>}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
