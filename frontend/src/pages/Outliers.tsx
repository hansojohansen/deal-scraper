import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, LayoutList, ExternalLink, ArrowUpDown } from "lucide-react";
import { api, type Outlier } from "../api/client";

const SOURCE_STYLE: Record<string, string> = {
  "finn.no": "bg-blue-100 text-blue-700",
  nettbil: "bg-purple-100 text-purple-700",
  auksjonen: "bg-amber-100 text-amber-700",
};

function pct(o: Outlier) {
  return Math.round(Math.abs((o.price ?? 0) / o.peer_avg_price - 1) * 100);
}

function DealBar({ value }: { value: number }) {
  const w = Math.min(100, (value / 50) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full" style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs font-semibold text-green-700 w-9">-{value}%</span>
    </div>
  );
}

type SortKey = "discount" | "price" | "year" | "mileage";

export default function Outliers() {
  const [view, setView] = useState<"table" | "cards">("table");
  const [sortKey, setSortKey] = useState<SortKey>("discount");
  const [sortAsc, setSortAsc] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["outliers-full"],
    queryFn: () => api.getOutliers(100),
  });

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((v) => !v);
    else { setSortKey(k); setSortAsc(false); }
  }

  const sorted = [...(data ?? [])].sort((a, b) => {
    let diff = 0;
    if (sortKey === "discount") diff = pct(a) - pct(b);
    else if (sortKey === "price") diff = (a.price ?? 0) - (b.price ?? 0);
    else if (sortKey === "year") diff = (a.year ?? 0) - (b.year ?? 0);
    else if (sortKey === "mileage") diff = (a.mileage ?? 0) - (b.mileage ?? 0);
    return sortAsc ? diff : -diff;
  });

  function Th({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th className="px-4 py-3 text-left">
        <button
          onClick={() => toggleSort(k)}
          className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${
            active ? "text-blue-700" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {label}
          <ArrowUpDown size={12} className={active ? "opacity-100" : "opacity-30"} />
        </button>
      </th>
    );
  }

  if (isLoading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          Beste kjøp <span className="text-gray-400 font-normal text-base">({sorted.length})</span>
        </h1>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => setView("table")}
            className={`p-1.5 rounded ${view === "table" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-700"}`}
            title="Table view"
          >
            <LayoutList size={16} />
          </button>
          <button
            onClick={() => setView("cards")}
            className={`p-1.5 rounded ${view === "cards" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-700"}`}
            title="Card view"
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {view === "table" ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Bil</th>
                  <Th label="År" k="year" />
                  <Th label="Km" k="mileage" />
                  <Th label="Pris" k="price" />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Snitt</th>
                  <Th label="Rabatt" k="discount" />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Kilde</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((o, i) => {
                  const d = pct(o);
                  return (
                    <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 whitespace-nowrap">{o.brand} {o.model}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[200px]">{o.title}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{o.year}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{o.mileage?.toLocaleString("no")} km</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{o.price?.toLocaleString("no")} kr</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{o.peer_avg_price.toLocaleString("no")} kr</td>
                      <td className="px-4 py-3 min-w-[140px]"><DealBar value={d} /></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_STYLE[o.reason?.split(" ")[0] ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                          finn
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={o.url} target="_blank" rel="noreferrer"
                          className="text-gray-400 hover:text-blue-600 transition-colors">
                          <ExternalLink size={15} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((o) => {
            const d = pct(o);
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
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-xl font-bold text-gray-900">{o.price?.toLocaleString("no")} kr</p>
                    <DealBar value={d} />
                    <p className="text-xs text-gray-400">Z = {o.score.toFixed(2)} · n={o.peer_group_size}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
