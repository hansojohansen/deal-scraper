import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ArrowLeft, GitCompare, Calculator } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api, type Car, type ScoreChip } from "../api/client";
import TradeInCalculator from "../components/TradeInCalculator";

function Chip({ chip }: { chip: ScoreChip }) {
  const cls = chip.type === "green"
    ? "bg-green-900/50 text-green-400 border border-green-800"
    : chip.type === "red"
    ? "bg-red-900/50 text-red-400 border border-red-800"
    : "bg-slate-700 text-slate-400 border border-slate-600";
  return <span className={`text-xs px-2.5 py-1 rounded-full ${cls}`}>{chip.label}</span>;
}

function SpecRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between py-2 border-b border-slate-700/50 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm text-slate-200 font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  const cls: Record<string, string> = {
    excellent: "bg-green-600 text-white",
    good: "bg-blue-600 text-white",
    check: "bg-yellow-600 text-slate-900",
  };
  const labels: Record<string, string> = { excellent: "Topp deal", good: "God deal", check: "Sjekk" };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls[tier] ?? "bg-slate-600 text-white"}`}>
      {labels[tier] ?? tier}
    </span>
  );
}

export default function CarDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const carId = parseInt(id ?? "", 10);
  const [tradeInOpen, setTradeInOpen] = useState(false);

  const { data: car, isLoading, isError } = useQuery<Car>({
    queryKey: ["car", carId],
    queryFn: () => api.getCar(carId),
    enabled: !isNaN(carId),
  });

  if (isLoading) return <p className="text-slate-400 text-center mt-20">Laster…</p>;
  if (isError || !car) return <p className="text-red-400 text-center mt-20">Fant ikke bilen.</p>;

  const monthly = car.price ? Math.round(car.price / 60) : null;
  const os = car.outlier_score;
  const discountPct = os?.score != null ? Math.round(Math.abs(os.score) * 100) : null;
  const fairValue = os?.fair_value ?? os?.peer_avg_price ?? null;

  const priceHistory = (car.price_history ?? []).map((p) => ({
    date: new Date(p.recorded_at).toLocaleDateString("no", { day: "2-digit", month: "short" }),
    pris: p.price,
  }));

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
        <ArrowLeft size={16} /> Tilbake
      </button>

      {/* Hero card */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {car.image_url ? (
          <img src={car.image_url} alt={car.title ?? ""} className="w-full h-52 object-cover" />
        ) : (
          <div className="w-full h-28 bg-slate-700/50 flex items-center justify-center">
            <span className="text-slate-600 text-5xl font-bold">{(car.brand ?? "?")[0]}</span>
          </div>
        )}
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-100">{car.title ?? `${car.brand} ${car.model}`}</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {[car.year, car.mileage != null ? `${car.mileage.toLocaleString("no")} km` : null]
                  .filter(Boolean).join(" · ")}
              </p>
            </div>
            <TierBadge tier={os?.quality_tier} />
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <span className="text-3xl font-bold text-slate-100">
              {car.price?.toLocaleString("no")} kr
            </span>
            {monthly && (
              <span className="text-slate-400 text-sm mb-0.5">~{monthly.toLocaleString("no")} kr/mnd</span>
            )}
            {discountPct != null && discountPct >= 5 && (
              <span className="text-green-400 font-bold text-lg mb-0.5">−{discountPct}%</span>
            )}
          </div>

          {fairValue && (
            <p className="text-xs text-slate-500">
              Estimert markedsverdi: {fairValue.toLocaleString("no")} kr
              {os?.peer_group_size ? ` · ${os.peer_group_size} sammenlignbare biler` : ""}
            </p>
          )}

          {car.score_chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {car.score_chips.map((c) => <Chip key={c.label} chip={c} />)}
            </div>
          )}

          <div className="flex gap-2 pt-2 flex-wrap">
            <a href={car.url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg text-sm transition-colors">
              <ExternalLink size={14} /> Se annonse
            </a>
            <button
              onClick={() => navigate(`/compare?ids=${car.id}`)}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-600 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
              <GitCompare size={14} /> Sammenlign
            </button>
            <button
              onClick={() => setTradeInOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-600 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
              <Calculator size={14} /> Trade-In
            </button>
          </div>
        </div>
      </div>

      {/* Price history chart */}
      {priceHistory.length > 1 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Prishistorikk</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={priceHistory} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
              />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(v: number) => [`${v.toLocaleString("no")} kr`, "Pris"]}
              />
              <Line type="monotone" dataKey="pris" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Specs */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Spesifikasjoner</h2>
        <SpecRow label="Merke" value={car.brand} />
        <SpecRow label="Modell" value={car.model} />
        <SpecRow label="Årsmodell" value={car.year != null ? String(car.year) : null} />
        <SpecRow label="Kilometerstand" value={car.mileage != null ? `${car.mileage.toLocaleString("no")} km` : null} />
        <SpecRow label="Drivstoff" value={car.fuel_type} />
        <SpecRow label="Girkasse" value={car.transmission} />
        <SpecRow label="Drivlinje" value={car.drivetrain} />
        <SpecRow label="Hestekrefter" value={car.horsepower != null ? `${car.horsepower} hk` : null} />
        <SpecRow label="Motorstørrelse" value={car.engine_size_cc != null ? `${car.engine_size_cc} cc` : null} />
        <SpecRow label="Karosseri" value={car.body_type} />
        <SpecRow label="Farge" value={car.color} />
        <SpecRow label="Antall eiere" value={car.num_owners != null ? String(car.num_owners) : null} />
        <SpecRow
          label="Selger"
          value={car.seller_type === "private" ? "Privat" : car.seller_type === "dealer" ? "Forhandler" : car.seller_type}
        />
        <SpecRow label="Sted" value={car.location} />
      </div>

      {/* Official data */}
      {(car.reg_number || car.eu_next_deadline || car.has_lien !== null) && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Offisielle data</h2>
          <SpecRow label="Reg.nr." value={car.reg_number} />
          <SpecRow label="Første registrering" value={car.first_reg_date ? car.first_reg_date.slice(0, 10) : null} />
          <SpecRow label="Norsk reg." value={car.is_norwegian_reg === true ? "Ja" : car.is_norwegian_reg === false ? "Nei" : null} />
          <SpecRow label="EU-kontroll utløper" value={car.eu_next_deadline ? car.eu_next_deadline.slice(0, 10) : null} />
          <SpecRow
            label="Heftelse"
            value={
              car.has_lien === false
                ? "Ingen (heftelsefri)"
                : car.has_lien === true
                ? `Ja${car.lien_amount ? ` — ${car.lien_amount.toLocaleString("no")} kr` : ""}`
                : null
            }
          />
        </div>
      )}

      {/* Description */}
      {car.description && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Beskrivelse</h2>
          <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{car.description}</p>
        </div>
      )}

      <TradeInCalculator car={car} isOpen={tradeInOpen} onClose={() => setTradeInOpen(false)} />
    </div>
  );
}
