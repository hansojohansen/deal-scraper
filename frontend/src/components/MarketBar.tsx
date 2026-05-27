import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export default function MarketBar() {
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: api.getStatsSummary });
  const { data: outliers } = useQuery({ queryKey: ["outliers"], queryFn: () => api.getOutliers(1) });

  if (!stats) return null;

  const topDeal = outliers?.[0]
    ? Math.round(Math.abs((outliers[0].price ?? 0) / outliers[0].peer_avg_price - 1) * 100)
    : null;

  const items = [
    { label: "Biler", value: stats.total_listings.toLocaleString("no") },
    { label: "Snittpris", value: `${stats.avg_price.toLocaleString("no")} kr` },
    { label: "Nye i dag", value: stats.new_today.toString() },
    ...(topDeal ? [{ label: "Beste deal", value: `-${topDeal}%` }] : []),
  ];

  return (
    <div className="bg-slate-950 text-xs px-4 py-2.5 flex items-center gap-0 overflow-x-auto shrink-0 border-b border-slate-800">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-2 whitespace-nowrap">
          {i > 0 && <span className="text-slate-700 mx-3">|</span>}
          <span className="text-slate-500 uppercase tracking-wide">{item.label}</span>
          <span className={`font-semibold ml-1 ${item.label === "Beste deal" ? "text-green-400" : "text-amber-400"}`}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}
