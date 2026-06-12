import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, Calculator } from "lucide-react";
import { api, type Car, type VegvesenData } from "../api/client";

interface Props {
  car: Car;
  isOpen: boolean;
  onClose: () => void;
}

const TRADE_IN_DISCOUNT = 0.88; // trade-in ~12% below retail median

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-slate-700/50 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm text-slate-200 font-medium">{value}</span>
    </div>
  );
}

export default function TradeInCalculator({ car, isOpen, onClose }: Props) {
  const [regInput, setRegInput] = useState(car.reg_number ?? "");
  const [submittedReg, setSubmittedReg] = useState<string | null>(car.reg_number ?? null);

  const { data: vegvesen, isLoading: vegLoading, error: vegError } = useQuery<VegvesenData>({
    queryKey: ["lookupReg", submittedReg],
    queryFn: () => api.lookupReg(submittedReg!),
    enabled: !!submittedReg,
    retry: false,
  });

  const { data: marketData } = useQuery({
    queryKey: ["marketStatsTradeIn", car.brand, car.model],
    queryFn: () => api.getMarketStats(car.brand ?? "", car.model ?? ""),
    enabled: !!car.brand && !!car.model,
  });

  const medianPrice = marketData?.find(
    (m) => m.brand === car.brand && m.model === car.model
  )?.median_price ?? null;

  const retailEstimate = medianPrice ?? car.outlier_score?.fair_value ?? car.price ?? null;
  const tradeInEstimate = retailEstimate ? Math.round(retailEstimate * TRADE_IN_DISCOUNT) : null;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const clean = regInput.trim().toUpperCase().replace(/\s/g, "");
    if (clean) setSubmittedReg(clean);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Calculator size={18} className="text-amber-400" />
            <h2 className="text-base font-semibold text-slate-100">Trade-In Kalkulator</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Reg lookup */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Registreringsnummer
            </label>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={regInput}
                onChange={(e) => setRegInput(e.target.value)}
                placeholder="AB12345"
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase"
              />
              <button
                type="submit"
                disabled={!regInput.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-900 font-semibold rounded-lg text-sm transition-colors"
              >
                <Search size={14} />
                Søk
              </button>
            </form>
          </div>

          {/* Vegvesen result */}
          {vegLoading && <p className="text-sm text-slate-400">Slår opp i Statens vegvesen…</p>}
          {vegError && (
            <p className="text-sm text-red-400">Kjøretøy ikke funnet eller ingen tilgang.</p>
          )}
          {vegvesen && !vegLoading && (
            <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4 space-y-0.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Vegvesen-data</p>
              <Row label="Reg.nr." value={vegvesen.reg_number} />
              <Row
                label="Første reg."
                value={vegvesen.first_reg_date ? String(vegvesen.first_reg_date).slice(0, 10) : null}
              />
              <Row
                label="EU-kontroll utløper"
                value={vegvesen.eu_next_deadline ? String(vegvesen.eu_next_deadline).slice(0, 10) : null}
              />
              <Row
                label="Heftelse"
                value={
                  vegvesen.has_lien === false
                    ? "Ingen (heftelsefri)"
                    : vegvesen.has_lien === true
                    ? `Ja${vegvesen.lien_amount ? ` — ${Number(vegvesen.lien_amount).toLocaleString("no")} kr` : ""}`
                    : null
                }
              />
            </div>
          )}

          {/* Price estimate */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Verdiestimat</p>
            <p className="text-xs text-slate-500">
              Basert på {medianPrice ? "markedsmedian fra solgte biler" : "prisavviksmodell / annonsepris"}.
            </p>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300">Retail estimat</span>
              <span className="text-base font-bold text-slate-100">
                {retailEstimate != null ? `${retailEstimate.toLocaleString("no")} kr` : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300">
                Trade-in estimat
                <span className="ml-1 text-xs text-slate-500">(−12%)</span>
              </span>
              <span className="text-base font-bold text-amber-400">
                {tradeInEstimate != null ? `${tradeInEstimate.toLocaleString("no")} kr` : "—"}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Estimatene er veiledende og basert på markedsdata. Faktisk innbyttepris avgjøres av kjøretøyets
            tilstand og forhandlerens vurdering.
          </p>
        </div>
      </div>
    </div>
  );
}
