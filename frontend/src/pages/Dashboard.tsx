import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { api } from "../api/client";

function pct(price: number, avg: number) {
  return Math.round(Math.abs((price - avg) / avg) * 100);
}

function DealBar({ value, max = 50 }: { value: number; max?: number }) {
  const w = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full" style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs font-semibold text-green-400 w-10 text-right">-{value}%</span>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["stats"], queryFn: api.getStatsSummary });
  const { data: outliers } = useQuery({ queryKey: ["outliers"], queryFn: () => api.getOutliers(8) });

  if (isLoading) return <p className="text-slate-400">Loading…</p>;
  if (!stats) return null;

  const topDiscount = outliers?.[0] ? pct(outliers[0].price ?? 0, outliers[0].peer_avg_price) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total biler", value: stats.total_listings.toLocaleString("no") },
          { label: "Nye i dag", value: stats.new_today },
          { label: "Snittpris", value: `${stats.avg_price.toLocaleString("no")} kr` },
          { label: "Beste deal", value: topDiscount ? `-${topDiscount}%` : "—" },
        ].map((c) => (
          <div key={c.label} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 30-day price trend */}
        {stats.price_trend_30d.length > 1 && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <p className="text-sm font-medium text-slate-300 mb-3">Prisutvikling 30 dager</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={stats.price_trend_30d}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString("no")} kr`, "Snittpris"]} />
                <Line type="monotone" dataKey="avg_price" stroke="#F59E0B" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Price by mileage */}
        {stats.price_by_km_buckets.length > 0 && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <p className="text-sm font-medium text-slate-300 mb-3">Snittpris etter kilometerstand</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.price_by_km_buckets} barSize={32}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString("no")} kr`, "Snittpris"]} />
                <Bar dataKey="avg_price" radius={[4, 4, 0, 0]}>
                  {stats.price_by_km_buckets.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#F59E0B" : "#92400e"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top deals */}
      {outliers && outliers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Beste kjøp akkurat nå</h2>
          <div className="bg-slate-800 rounded-xl border border-slate-700 divide-y divide-slate-700">
            {outliers.map((o) => {
              const d = pct(o.price ?? 0, o.peer_avg_price);
              return (
                <a key={o.id} href={o.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-4 px-4 py-3 hover:bg-slate-700/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-100 truncate">{o.title ?? `${o.brand} ${o.model}`}</p>
                    <p className="text-xs text-slate-400">{o.year} · {o.mileage?.toLocaleString("no")} km</p>
                  </div>
                  <div className="w-32 shrink-0">
                    <DealBar value={d} />
                  </div>
                  <div className="text-right shrink-0 w-28">
                    <p className="font-bold text-slate-100 text-sm">{o.price?.toLocaleString("no")} kr</p>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
