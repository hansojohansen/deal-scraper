import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search, AlertTriangle } from "lucide-react";
import { api, type PortfolioItem } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

const TIER_BADGE: Record<string, string> = {
  excellent: "bg-green-600 text-white",
  good: "bg-blue-600 text-white",
  check: "bg-yellow-600 text-slate-900",
};

const REC_COLOR: Record<string, string> = {
  "Kjøp — sterkt underpriset": "text-green-400",
  "Interessant — under markedspris": "text-green-300",
  "Rettferdig priset": "text-slate-400",
  "Overpriset — forhandle ned": "text-red-400",
  "Ingen data": "text-slate-600",
};

export default function Portfolio() {
  const { user } = useAuth();
  const [input, setInput] = useState("");

  const isPro = user?.plan === "pro" || user?.plan === "dealer";

  const mut = useMutation({
    mutationFn: (ids: number[]) => api.portfolioAnalysis(ids),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ids = input
      .split(/[\n,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    if (ids.length > 0) mut.mutate(ids);
  }

  if (!isPro) {
    return (
      <div className="text-center py-20 space-y-3">
        <AlertTriangle size={36} className="text-amber-500 mx-auto" />
        <p className="text-slate-300 font-semibold">Portfolio-analyse krever Pro- eller Dealer-abonnement.</p>
        <p className="text-slate-500 text-sm">Analyser opptil 50 biler med én forespørsel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Portfolio-analyse</h1>
        <p className="text-sm text-slate-500 mt-1">Lim inn BilDeal-ID-er (én per linje eller kommaseparert) for å få prisavvik og anbefalinger.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          placeholder={"12345\n67890\n11234"}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
        />
        <button
          type="submit"
          disabled={mut.isPending || !input.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-900 font-semibold rounded-lg text-sm transition-colors"
        >
          <Search size={15} />
          {mut.isPending ? "Analyserer…" : "Analyser"}
        </button>
      </form>

      {mut.isError && (
        <p className="text-red-400 text-sm">Feil: {(mut.error as Error).message}</p>
      )}

      {mut.data && mut.data.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Bil</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Pris</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Markedsverdi</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Avvik</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Anbefaling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {(mut.data as PortfolioItem[]).map((item) => (
                <tr key={item.car_id} className="hover:bg-slate-700/40 transition-colors">
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.car_id}</td>
                  <td className="px-4 py-3">
                    <p className="text-slate-100 font-medium leading-snug">
                      {item.title ?? [item.brand, item.model, item.year].filter(Boolean).join(" ")}
                    </p>
                    {item.quality_tier && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${TIER_BADGE[item.quality_tier] ?? "bg-slate-700 text-slate-300"}`}>
                        {item.quality_tier}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-200">
                    {item.price != null ? `${item.price.toLocaleString("no")} kr` : "–"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {item.fair_value != null ? `${item.fair_value.toLocaleString("no")} kr` : "–"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.discount_pct != null ? (
                      <span className={item.discount_pct >= 10 ? "text-green-400 font-bold" : "text-slate-400"}>
                        −{item.discount_pct}%
                      </span>
                    ) : "–"}
                  </td>
                  <td className={`px-4 py-3 text-xs font-medium ${REC_COLOR[item.recommendation] ?? "text-slate-400"}`}>
                    {item.recommendation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mut.data && mut.data.length === 0 && (
        <p className="text-slate-500 text-sm">Ingen biler funnet for de oppgitte ID-ene.</p>
      )}
    </div>
  );
}
