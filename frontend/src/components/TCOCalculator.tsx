import { useState, useMemo } from "react";
import { X, TrendingDown } from "lucide-react";
import type { Car } from "../api/client";

interface Props {
  car: Car;
  isOpen: boolean;
  onClose: () => void;
}

const FUEL_COST_PER_KM: Record<string, number> = {
  Elektrisk: 0.30,
  Electric: 0.30,
  Diesel: 1.20,
  Bensin: 1.80,
  Gasoline: 1.80,
  Hybrid: 0.80,
  "Plug-in hybrid": 0.55,
};

const TOLL_BY_ZIP: Record<string, number> = {
  "0": 500, "1": 420, "5": 380, "4": 320, "7": 300,
};

const INTEREST_RATE = 0.069;
const LOAN_MONTHS = 60;

function annuity(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12;
  return Math.round(principal * r / (1 - Math.pow(1 + r, -months)));
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between py-2 border-b border-slate-700/50 last:border-0 ${highlight ? "font-bold" : ""}`}>
      <span className={`text-sm ${highlight ? "text-slate-100" : "text-slate-400"}`}>{label}</span>
      <span className={`text-sm ${highlight ? "text-amber-400 text-base" : "text-slate-200"}`}>{value}</span>
    </div>
  );
}

export default function TCOCalculator({ car, isOpen, onClose }: Props) {
  const [annualKm, setAnnualKm] = useState(15000);
  const [financing, setFinancing] = useState(true);
  const [zipPrefix, setZipPrefix] = useState("0");
  const [downPct, setDownPct] = useState(20);

  const tco = useMemo(() => {
    const price = car.price ?? 0;
    const loan = price * (1 - downPct / 100);

    const monthlyFinancing = financing ? annuity(loan, INTEREST_RATE, LOAN_MONTHS) : 0;

    const fuelKey = Object.keys(FUEL_COST_PER_KM).find(
      (k) => k.toLowerCase() === (car.fuel_type ?? "").toLowerCase()
    );
    const fuelRate = fuelKey ? FUEL_COST_PER_KM[fuelKey] : 1.20;
    const monthlyFuel = Math.round((annualKm / 12) * fuelRate);

    const monthlyInsurance = 1800;

    const monthlyTolls = TOLL_BY_ZIP[zipPrefix] ?? 120;

    const monthlyDepreciation = Math.round(price * 0.15 / 12);

    const total = monthlyFinancing + monthlyFuel + monthlyInsurance + monthlyTolls + monthlyDepreciation;

    return { monthlyFinancing, monthlyFuel, monthlyInsurance, monthlyTolls, monthlyDepreciation, total };
  }, [car, annualKm, financing, zipPrefix, downPct]);

  if (!isOpen) return null;

  const fmt = (n: number) => n.toLocaleString("no");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-700 sticky top-0 bg-slate-800">
          <div className="flex items-center gap-2">
            <TrendingDown size={18} className="text-amber-400" />
            <h2 className="text-base font-semibold text-slate-100">TCO-kalkulator</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-xs text-slate-500">
            {car.title ?? `${car.brand} ${car.model}`} — {car.price?.toLocaleString("no")} kr
          </p>

          {/* Inputs */}
          <div className="space-y-4">
            <div>
              <label className="flex justify-between text-xs font-medium text-slate-400 mb-1.5">
                <span>Kjørelengde per år</span>
                <span className="text-slate-200">{fmt(annualKm)} km</span>
              </label>
              <input
                type="range" min={5000} max={50000} step={1000}
                value={annualKm}
                onChange={(e) => setAnnualKm(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                <span>5 000</span><span>50 000</span>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Postnummer (første siffer)</label>
                <select
                  value={zipPrefix}
                  onChange={(e) => setZipPrefix(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="0">0— Oslo sentrum</option>
                  <option value="1">1— Oslo/Akershus</option>
                  <option value="4">4— Stavanger</option>
                  <option value="5">5— Bergen</option>
                  <option value="7">7— Trondheim</option>
                  <option value="2">Andre</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="flex justify-between text-xs font-medium text-slate-400 mb-1.5">
                  <span>Egenandel</span>
                  <span className="text-slate-200">{downPct}%</span>
                </label>
                <input
                  type="range" min={0} max={50} step={5}
                  value={downPct}
                  onChange={(e) => setDownPct(Number(e.target.value))}
                  className="w-full mt-2 accent-amber-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={financing}
                onChange={(e) => setFinancing(e.target.checked)}
                className="accent-amber-500 w-4 h-4"
              />
              <span className="text-sm text-slate-300">Finansiering (6,9% p.a., {LOAN_MONTHS} mnd)</span>
            </label>
          </div>

          {/* Results */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4 space-y-0.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Månedskostnad</p>
            {financing && (
              <Row label="Finansiering" value={`${fmt(tco.monthlyFinancing)} kr`} />
            )}
            <Row label="Drivstoff / lading" value={`${fmt(tco.monthlyFuel)} kr`} />
            <Row label="Forsikring (estimat)" value={`${fmt(tco.monthlyInsurance)} kr`} />
            <Row label="Bompenger" value={`${fmt(tco.monthlyTolls)} kr`} />
            <Row label="Verditap (15%/år)" value={`${fmt(tco.monthlyDepreciation)} kr`} />
            <div className="pt-1">
              <Row label="Totalt / mnd" value={`${fmt(tco.total)} kr`} highlight />
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Estimatene er veiledende. Forsikring varierer etter alder og historikk. Drivstoff basert på
            norske snittpriser. Verditap er gjennomsnittlig for bruktbiler.
          </p>
        </div>
      </div>
    </div>
  );
}
