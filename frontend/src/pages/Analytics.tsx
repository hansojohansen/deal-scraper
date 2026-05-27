import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
} from "recharts";
import { api, type ModelStats } from "../api/client";

const fmt = (n: number) => n.toLocaleString("no");
type SortKey = "count" | "avg_price" | "min_price" | "max_price";

export default function Analytics() {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortAsc, setSortAsc] = useState(false);

  const { data: brandsData } = useQuery({ queryKey: ["brands"], queryFn: api.getBrands });
  const brands = brandsData ?? [];

  const { data: modelsData } = useQuery({
    queryKey: ["modelsByBrand", brand],
    queryFn: () => api.getModelsByBrand(brand),
    enabled: !!brand,
  });

  const { data: modelStats, isLoading: statsLoading } = useQuery({
    queryKey: ["modelStats", brand],
    queryFn: () => api.getModelStats(brand),
    enabled: !!brand,
  });

  // Scatter data: all cars for selected brand+model
  const { data: scatterPage } = useQuery({
    queryKey: ["scatterCars", brand, model],
    queryFn: () => api.getCars({ brand, model, limit: 200 }),
    enabled: !!brand && !!model,
  });
  const scatterData = (scatterPage?.items ?? [])
    .filter((c) => c.mileage != null && c.price != null)
    .map((c) => ({
      x: c.mileage!,
      y: c.price!,
      isOutlier: !!c.outlier_score,
      title: c.title,
      year: c.year,
    }));
  const avgPrice = modelStats?.find((m) => m.model === model)?.avg_price;

  const sorted = [...(modelStats ?? [])].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortAsc ? diff : -diff;
  });
  const chartData = sorted.slice(0, 20);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((v) => !v);
    else { setSortKey(k); setSortAsc(false); }
  }

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <button onClick={() => toggleSort(k)}
        className={`text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${
          active ? "text-amber-400" : "text-slate-400 hover:text-slate-100"
        }`}>
        {label}{active ? (sortAsc ? " ↑" : " ↓") : ""}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">Prisanalyse</h1>

      {/* Brand + model selectors */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-wrap gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Merke</label>
          <select value={brand} onChange={(e) => { setBrand(e.target.value); setModel(""); }}
            className="w-48 border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">— velg merke —</option>
            {brands.map((b) => (
              <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>
            ))}
          </select>
        </div>
        {brand && (modelsData ?? []).length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Modell (scatter)</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}
              className="w-48 border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">— velg modell —</option>
              {(modelsData ?? []).map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        )}
      </div>

      {!brand && (
        <p className="text-slate-500 text-sm">Velg et merke for å se prisfordelingen.</p>
      )}

      {brand && statsLoading && <p className="text-slate-400 text-sm">Laster…</p>}

      {brand && sorted.length > 0 && (
        <>
          {/* Bar chart */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Snittpris per modell — {brand} (topp 20)</h2>
            <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis type="category" dataKey="model" width={120} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip formatter={(v: number) => [`${fmt(v)} kr`, "Snittpris"]} labelStyle={{ fontWeight: 600 }} />
                <Bar dataKey="avg_price" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={i === 0 ? "#F59E0B" : "#92400e"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Scatter chart */}
          {model && scatterData.length > 0 && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-1">
                Pris vs km — {brand} {model}
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Røde prikker = prisavvik (outlier). Stiplet linje = snittpris.
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ left: 8, right: 16, top: 4, bottom: 8 }}>
                  <XAxis type="number" dataKey="x" name="km" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#94a3b8" }} label={{ value: "km", position: "insideBottomRight", offset: -4, fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name="kr" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <ZAxis range={[40, 40]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ payload }) => {
                      const d = payload?.[0]?.payload;
                      if (!d) return null;
                      return (
                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs shadow">
                          <p className="font-semibold text-slate-100">{d.title}</p>
                          <p className="text-slate-400">{d.year} · {d.x.toLocaleString("no")} km</p>
                          <p className="font-bold text-slate-100">{d.y.toLocaleString("no")} kr</p>
                          {d.isOutlier && <p className="text-green-400 font-semibold">Prisavvik (deal)</p>}
                        </div>
                      );
                    }}
                  />
                  {avgPrice && (
                    <ReferenceLine y={avgPrice} stroke="#94a3b8" strokeDasharray="4 4"
                      label={{ value: `Snitt ${fmt(avgPrice)} kr`, position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }} />
                  )}
                  <Scatter
                    data={scatterData.filter((d) => !d.isOutlier)}
                    fill="#92400e"
                    fillOpacity={0.7}
                  />
                  <Scatter
                    data={scatterData.filter((d) => d.isOutlier)}
                    fill="#ef4444"
                    fillOpacity={0.9}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-4 py-3">Modell</th>
                  <th className="px-4 py-3"><SortHeader label="Annonser" k="count" /></th>
                  <th className="px-4 py-3"><SortHeader label="Snittpris" k="avg_price" /></th>
                  <th className="px-4 py-3"><SortHeader label="Lavest" k="min_price" /></th>
                  <th className="px-4 py-3"><SortHeader label="Høyest" k="max_price" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {sorted.map((row: ModelStats) => (
                  <tr key={row.model} className="hover:bg-slate-700/50 transition-colors cursor-pointer"
                    onClick={() => setModel(row.model)}>
                    <td className="px-4 py-3 font-medium text-slate-100">{row.model}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{row.count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100">{fmt(row.avg_price)} kr</td>
                    <td className="px-4 py-3 text-right text-slate-400">{fmt(row.min_price)} kr</td>
                    <td className="px-4 py-3 text-right text-slate-400">{fmt(row.max_price)} kr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
