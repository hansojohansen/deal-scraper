import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { api, type ModelStats } from "../api/client";

const fmt = (n: number) => n.toLocaleString("no");

type SortKey = "count" | "avg_price" | "min_price" | "max_price";

export default function Analytics() {
  const [brand, setBrand] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortAsc, setSortAsc] = useState(false);

  const { data: brandsData } = useQuery({
    queryKey: ["brands"],
    queryFn: api.getBrands,
  });
  const brands = brandsData ?? [];

  const { data: modelStats, isLoading } = useQuery({
    queryKey: ["modelStats", brand],
    queryFn: () => api.getModelStats(brand),
    enabled: !!brand,
  });

  const sorted = [...(modelStats ?? [])].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortAsc ? diff : -diff;
  });

  const chartData = sorted.slice(0, 20);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${
          active ? "text-blue-700" : "text-gray-500 hover:text-gray-800"
        }`}
      >
        {label} {active ? (sortAsc ? "↑" : "↓") : ""}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Model Analytics</h1>

      {/* Brand selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select brand</label>
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— choose a brand —</option>
          {brands.map((b) => (
            <option key={b.brand} value={b.brand}>
              {b.brand} ({b.count})
            </option>
          ))}
        </select>
      </div>

      {!brand && (
        <p className="text-gray-400 text-sm">Choose a brand above to see model price breakdown.</p>
      )}

      {brand && isLoading && <p className="text-gray-500 text-sm">Loading…</p>}

      {brand && sorted.length > 0 && (
        <>
          {/* Bar chart — avg price per model */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Avg price per model — {brand} (top 20)
            </h2>
            <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 8, right: 40, top: 4, bottom: 4 }}
              >
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="model"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(v: number) => [`${fmt(v)} kr`, "Avg price"]}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="avg_price" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#2563eb" : "#93c5fd"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sortable table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 px-4 py-3">
                    Model
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Listings" k="count" />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Avg price" k="avg_price" />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Min" k="min_price" />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Max" k="max_price" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((row: ModelStats) => (
                  <tr key={row.model} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.model}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {fmt(row.avg_price)} kr
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{fmt(row.min_price)} kr</td>
                    <td className="px-4 py-3 text-right text-gray-500">{fmt(row.max_price)} kr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {brand && !isLoading && sorted.length === 0 && (
        <p className="text-gray-400 text-sm">No model data found for {brand}.</p>
      )}
    </div>
  );
}
