import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export default function Outliers() {
  const { data, isLoading } = useQuery({ queryKey: ["outliers-full"], queryFn: () => api.getOutliers(100) });

  if (isLoading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Best deals ({data?.length ?? 0})</h1>
      {data?.map((o) => {
        const pct = Math.round(Math.abs((o.price ?? 0) / o.peer_avg_price - 1) * 100);
        return (
          <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <a href={o.url} target="_blank" rel="noreferrer"
                  className="font-semibold text-blue-700 hover:underline">
                  {o.title ?? `${o.brand} ${o.model}`}
                </a>
                <p className="text-sm text-gray-500 mt-0.5">
                  {o.year} · {o.mileage?.toLocaleString("no")} km
                </p>
                <p className="text-xs text-gray-400 mt-1">{o.reason}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-bold text-gray-900">{o.price?.toLocaleString("no")} kr</p>
                <span className="inline-block mt-1 text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                  -{pct}% below market
                </span>
                <p className="text-xs text-gray-400 mt-1">Z = {o.score.toFixed(2)} · n={o.peer_group_size}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
