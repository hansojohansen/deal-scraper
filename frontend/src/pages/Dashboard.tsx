import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../api/client";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function pct(price: number, avg: number) {
  return Math.round(Math.abs((price - avg) / avg) * 100);
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["stats"], queryFn: api.getStatsSummary });
  const { data: outliers } = useQuery({ queryKey: ["outliers"], queryFn: () => api.getOutliers(5) });

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (!stats) return null;

  const topDiscount = outliers?.[0]
    ? pct(outliers[0].price ?? 0, outliers[0].peer_avg_price)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total listings" value={stats.total_listings.toLocaleString("no")} />
        <StatCard label="New today" value={stats.new_today} />
        <StatCard label="Avg price" value={`${stats.avg_price.toLocaleString("no")} kr`} />
        <StatCard label="Top discount" value={topDiscount ? `${topDiscount}%` : "—"} />
      </div>

      {stats.price_trend_30d.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">30-day price trend</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={stats.price_trend_30d}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => [`${v.toLocaleString("no")} kr`, "Avg price"]} />
              <Line type="monotone" dataKey="avg_price" stroke="#2563eb" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {outliers && outliers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Top deals right now</h2>
          <div className="space-y-2">
            {outliers.map((o) => (
              <a key={o.id} href={o.url} target="_blank" rel="noreferrer"
                className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-blue-400 transition-colors">
                <div>
                  <span className="font-medium text-gray-900">{o.title ?? `${o.brand} ${o.model}`}</span>
                  <span className="text-gray-500 text-sm ml-2">{o.year} · {o.mileage?.toLocaleString("no")} km</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-gray-900">{o.price?.toLocaleString("no")} kr</span>
                  <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    -{pct(o.price ?? 0, o.peer_avg_price)}%
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
