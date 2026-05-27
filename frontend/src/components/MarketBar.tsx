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
    <div className="bg-gray-900 text-white text-xs px-4 py-2 flex items-center gap-0 overflow-x-auto shrink-0">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-2 whitespace-nowrap">
          {i > 0 && <span className="text-gray-600 mx-3">|</span>}
          <span className="text-gray-400">{item.label}</span>
          <span className="font-semibold text-white ml-1">{item.value}</span>
        </span>
      ))}
    </div>
  );
}
