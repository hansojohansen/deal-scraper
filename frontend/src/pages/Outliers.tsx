import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, LayoutList, ExternalLink, ArrowUpDown } from "lucide-react";
import { api, type Outlier } from "../api/client";

const TIER_STYLE: Record<string, { label: string; cls: string }> = {
  excellent: { label: "Topp",  cls: "bg-emerald-900/50 text-emerald-400 border border-emerald-700" },
  good:      { label: "God",   cls: "bg-blue-900/50 text-blue-400 border border-blue-700" },
  check:     { label: "Sjekk", cls: "bg-amber-900/50 text-amber-400 border border-amber-700" },
  skip:      { label: "Skip",  cls: "bg-slate-800 text-slate-500 border border-slate-700" },
};

function QualityBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const t = TIER_STYLE[tier] ?? TIER_STYLE.good;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.cls}`}>
      {t.label}
    </span>
  );
}

function pct(o: Outlier) {
  const ref = o.fair_value ?? o.peer_avg_price;
  return Math.round(Math.abs((o.price ?? 0) / ref - 1) * 100);
}

function DealBar({ value }: { value: number }) {
  const w = Math.min(100, (value / 50) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full" style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs font-semibold text-green-400 w-9">-{value}%</span>
    </div>
  );
}

type SortKey = "discount" | "price" | "year" | "mileage";
type TierFilter = "all" | "excellent" | "good" | "check";

const TIER_FILTERS: { key: TierFilter; label: string }[] = [
  { key: "all",       label: "Alle" },
  { key: "excellent", label: "Topp deal" },
  { key: "good",      label: "God deal" },
  { key: "check",     label: "Sjekk nøye" },
];

export default function Outliers() {
  const [view, setView] = useState<"table" | "cards">("table");
  const [sortKey, setSortKey] = useState<SortKey>("discount");
  const [sortAsc, setSortAsc] = useState(false);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["outliers-full"],
    queryFn: () => api.getOutliers(100),
  });

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((v) => !v);
    else { setSortKey(k); setSortAsc(false); }
  }

  const filtered = (data ?? []).filter(
    (o) => tierFilter === "all" || o.quality_tier === tierFilter
  );

  const sorted = [...filtered].sort((a, b) => {
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
            active ? "text-amber-400" : "text-slate-400 hover:text-slate-100"
          }`}
        >
          {label}
          <ArrowUpDown size={12} className={active ? "opacity-100" : "opacity-30"} />
        </button>
      </th>
    );
  }

  if (isLoading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">
          Beste kjøp <span className="text-slate-500 font-normal text-base">({sorted.length})</span>
        </h1>
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
          <button
            onClick={() => setView("table")}
            className={`p-1.5 rounded ${view === "table" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-300"}`}
            title="Table view"
          >
            <LayoutList size={16} />
          </button>
          <button
            onClick={() => setView("cards")}
            className={`p-1.5 rounded ${view === "cards" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-300"}`}
            title="Card view"
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {/* Quality tier filter */}
      <div className="flex items-center gap-2">
        {TIER_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTierFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              tierFilter === key
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "table" ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Bil</th>
                  <Th label="År" k="year" />
                  <Th label="Km" k="mileage" />
                  <Th label="Pris" k="price" />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Takst</th>
                  <Th label="Rabatt" k="discount" />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Kvalitet</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {sorted.map((o, i) => {
                  const d = pct(o);
                  const ref = o.fair_value ?? o.peer_avg_price;
                  return (
                    <tr key={o.id} className="hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 text-xs">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-100 whitespace-nowrap">{o.brand} {o.model}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">{o.title}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{o.year}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{o.mileage?.toLocaleString("no")} km</td>
                      <td className="px-4 py-3 font-semibold text-slate-100 whitespace-nowrap">{o.price?.toLocaleString("no")} kr</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {ref?.toLocaleString("no")} kr
                        {o.method === "ols" && <span className="ml-1 text-slate-600">(OLS)</span>}
                      </td>
                      <td className="px-4 py-3 min-w-[140px]"><DealBar value={d} /></td>
                      <td className="px-4 py-3"><QualityBadge tier={o.quality_tier} /></td>
                      <td className="px-4 py-3">
                        <a href={o.url} target="_blank" rel="noreferrer"
                          className="text-slate-500 hover:text-blue-600 transition-colors">
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
            const ref = o.fair_value ?? o.peer_avg_price;
            return (
              <div key={o.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <a href={o.url} target="_blank" rel="noreferrer"
                        className="font-semibold text-amber-400 hover:underline">
                        {o.title ?? `${o.brand} ${o.model}`}
                      </a>
                      <QualityBadge tier={o.quality_tier} />
                    </div>
                    <p className="text-sm text-slate-400">
                      {o.year} · {o.mileage?.toLocaleString("no")} km
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{o.reason}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-xl font-bold text-slate-100">{o.price?.toLocaleString("no")} kr</p>
                    <p className="text-xs text-slate-500">
                      Takst: {ref?.toLocaleString("no")} kr
                      {o.method === "ols" && " (OLS)"}
                    </p>
                    <DealBar value={d} />
                    <p className="text-xs text-slate-600">n={o.peer_group_size}</p>
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
