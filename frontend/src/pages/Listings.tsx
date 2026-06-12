import { useState, useEffect, useRef, useMemo, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X, Bell, Heart, Plus } from "lucide-react";
import { api, type Car, type CarFilters } from "../api/client";
import BargainGauge from "../components/BargainGauge";
import { useAuth } from "../contexts/AuthContext";
import { useCompare } from "../hooks/useCompare";

const FUEL_TYPES = ["Bensin", "Diesel", "El", "Hybrid bensin", "Ladbar hybrid"];
const TRANSMISSIONS = ["Manuell", "Automat"];
const DRIVETRAINS = ["fwd", "rwd", "awd", "4wd"];
const DRIVETRAIN_LABELS: Record<string, string> = { fwd: "Forhjul", rwd: "Bakhjul", awd: "AWD", "4wd": "4WD" };
const empty: CarFilters = {};

// Deterministic brand color from name
const BRAND_COLORS = [
  "bg-amber-500", "bg-violet-500", "bg-emerald-500", "bg-orange-500",
  "bg-rose-500", "bg-cyan-500", "bg-amber-500", "bg-teal-500",
];
function brandColor(brand: string | null) {
  if (!brand) return BRAND_COLORS[0];
  let h = 0;
  for (let i = 0; i < brand.length; i++) h = (h * 31 + brand.charCodeAt(i)) & 0xffffff;
  return BRAND_COLORS[Math.abs(h) % BRAND_COLORS.length];
}

function euBadge(deadline: string | null) {
  if (!deadline) return null;
  const d = new Date(deadline);
  const now = new Date();
  const yr = 365.25 * 24 * 3600 * 1000;
  if (d < now) return { label: "EU utløpt", cls: "bg-red-100 text-red-700" };
  if (d.getTime() - now.getTime() < yr) return { label: "EU snart", cls: "bg-orange-100 text-orange-700" };
  return { label: "EU ok", cls: "bg-green-900/40 text-green-400" };
}

function ConditionBadges({ signals }: { signals: Record<string, unknown> }) {
  if (!signals || Object.keys(signals).length === 0) return null;
  const green: string[] = [];
  const red: string[] = [];
  if (signals.is_one_owner === true) green.push("1 eier");
  if (signals.has_service_history === true) green.push("Servicebok");
  if (signals.recently_serviced === true) green.push("Nylig serv.");
  if (signals.has_new_tires === true) green.push("Nye dekk");
  if (signals.has_warranty === true) green.push("Garanti");
  if (signals.is_smoke_free === true) green.push("Røykfri");
  if (signals.has_accident_history === true) red.push("Ulykke");
  if (signals.has_rust === true) red.push("Rust");
  if (signals.is_imported === true) red.push("Import");
  if (green.length === 0 && red.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 pt-0.5">
      {green.map((l) => (
        <span key={l} className="text-[10px] bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded">{l}</span>
      ))}
      {red.map((l) => (
        <span key={l} className="text-[10px] bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">{l}</span>
      ))}
    </div>
  );
}

function ScoreChipBadges({ chips }: { chips: Car["score_chips"] }) {
  if (!chips || chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 pt-0.5">
      {chips.map((c) => {
        const cls =
          c.type === "green" ? "bg-green-900/50 text-green-400" :
          c.type === "red"   ? "bg-red-900/50 text-red-400" :
                               "bg-slate-700 text-slate-400";
        return (
          <span key={c.label} className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{c.label}</span>
        );
      })}
    </div>
  );
}

const CarCard = memo(function CarCard({ car, savedIds, onToggleSave, compareIds, onToggleCompare }: {
  car: Car;
  savedIds: Set<number>;
  onToggleSave: (car: Car) => void;
  compareIds: number[];
  onToggleCompare: (car: Car) => void;
}) {
  const eu = euBadge(car.eu_next_deadline);
  const initial = (car.brand ?? "?")[0].toUpperCase();
  const isSaved = savedIds.has(car.id);
  const isInCompare = compareIds.includes(car.id);
  const monthlyCost = car.price ? Math.round(car.price / 60) : null;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 hover:border-blue-400 hover:shadow-sm transition-all overflow-hidden">
      {/* Color header / image */}
      <a href={car.url} target="_blank" rel="noreferrer" className="block">
        <div className={`relative h-[100px] ${car.image_url ? "" : brandColor(car.brand)} flex items-center justify-center overflow-hidden`}>
          {car.image_url
            ? <img src={car.image_url} alt={car.title ?? ""} className="w-full h-full object-cover" loading="lazy" decoding="async" />
            : <span className="text-white text-4xl font-bold opacity-30 select-none">{initial}</span>
          }
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {car.listing_type === "auction" && (
              <span className="text-xs bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded font-semibold">AUKSJON</span>
            )}
            {car.is_norwegian_reg === false && (
              <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded font-semibold">IMPORT</span>
            )}
            {eu && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${eu.cls}`}>{eu.label}</span>
            )}
          </div>
        </div>
      </a>

      {/* Card body */}
      <div className="p-3 space-y-1.5">
        <a href={`/cars/${car.id}`} className="block">
          <p className="font-semibold text-slate-100 text-sm leading-tight line-clamp-1 hover:text-amber-400 transition-colors">{car.title}</p>
        </a>
        <p className="text-xs text-slate-400">
          {car.year} · {car.mileage?.toLocaleString("no")} km
          {car.fuel_type ? ` · ${car.fuel_type}` : ""}
          {car.transmission ? ` · ${car.transmission}` : ""}
        </p>
        {car.location && <p className="text-xs text-slate-500">{car.location}</p>}

        <ConditionBadges signals={car.condition_signals ?? {}} />
        <ScoreChipBadges chips={car.score_chips ?? []} />

        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="font-bold text-slate-100">{car.price?.toLocaleString("no")} kr</p>
            {monthlyCost && (
              <p className="text-[10px] text-slate-500">~{monthlyCost.toLocaleString("no")} kr/mnd</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {car.outlier_score && (
              <BargainGauge score={car.outlier_score.score} size="sm" />
            )}
            <button
              onClick={(e) => { e.preventDefault(); onToggleSave(car); }}
              title={isSaved ? "Fjern fra lagret" : "Lagre"}
              className="p-1 rounded hover:bg-slate-700 transition-colors"
            >
              <Heart
                size={15}
                className={isSaved ? "text-rose-400 fill-rose-400" : "text-slate-500"}
              />
            </button>
            <button
              title={isInCompare ? "Fjern fra sammenligning" : "Legg til sammenligning"}
              className={`p-1 rounded hover:bg-slate-700 transition-colors ${isInCompare ? "text-amber-400" : "text-slate-500 hover:text-amber-400"}`}
              onClick={(e) => { e.preventDefault(); onToggleCompare(car); }}
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

type SortMode = "newest" | "price_asc" | "price_desc" | "discount" | "auctions";

function sortCars(cars: Car[], mode: SortMode): Car[] {
  const c = [...cars];
  if (mode === "price_asc") return c.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  if (mode === "price_desc") return c.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  if (mode === "discount") return c.sort((a, b) => (a.outlier_score?.score ?? 0) - (b.outlier_score?.score ?? 0));
  if (mode === "auctions") return [
    ...c.filter((x) => x.listing_type === "auction"),
    ...c.filter((x) => x.listing_type !== "auction"),
  ];
  return c; // newest = server order
}

const FILTER_KEYS: (keyof CarFilters)[] = [
  "brand", "model", "title", "year_min", "year_max", "price_min", "price_max",
  "mileage_min", "mileage_max", "fuel_type", "listing_type", "transmission",
  "seller_type", "drivetrain", "num_owners_max", "horsepower_min", "horsepower_max",
  "is_norwegian_reg", "has_service_history", "accident_free", "monthly_cost_max",
];

export default function Listings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { ids: compareIds, add: addToCompare, remove: removeFromCompare } = useCompare();

  // Applied filters always reflect URL — source of truth for the query
  const applied = useMemo<CarFilters>(() => {
    const f: CarFilters = {};
    FILTER_KEYS.forEach((k) => { const v = searchParams.get(k); if (v) (f as Record<string, string>)[k] = v; });
    return f;
  }, [searchParams]);

  const [filters, setFilters] = useState<CarFilters>(() => {
    // Init form state from URL on first render
    const f: CarFilters = {};
    FILTER_KEYS.forEach((k) => { const v = searchParams.get(k); if (v) (f as Record<string, string>)[k] = v; });
    return f;
  });
  const [sort, setSort] = useState<SortMode>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Populate savedIds from watchlist on mount if authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    api.getWatchlist().then((cars) => {
      setSavedIds(new Set(cars.map((c) => c.id)));
    }).catch(() => { /* silently fail */ });
  }, [isAuthenticated]);

  async function handleToggleSave(car: Car) {
    if (!isAuthenticated) { navigate("/login"); return; }
    const alreadySaved = savedIds.has(car.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (alreadySaved) next.delete(car.id); else next.add(car.id);
      return next;
    });
    try {
      if (alreadySaved) await api.removeFromWatchlist(car.id);
      else await api.addToWatchlist(car.id);
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (alreadySaved) next.add(car.id); else next.delete(car.id);
        return next;
      });
      setToast(alreadySaved ? "Kunne ikke fjerne fra lagret" : "Kunne ikke lagre bilen");
      setTimeout(() => setToast(null), 3000);
    }
  }

  function handleToggleCompare(car: Car) {
    if (compareIds.includes(car.id)) removeFromCompare(car.id);
    else addToCompare({ id: car.id, title: car.title ?? `${car.brand} ${car.model}` });
  }

  const { data: brandsData } = useQuery({ queryKey: ["brands"], queryFn: api.getBrands });
  const brands = brandsData?.map((b) => b.brand) ?? [];

  const { data: modelsData } = useQuery({
    queryKey: ["models", filters.brand],
    queryFn: () => api.getModelsByBrand(filters.brand!),
    enabled: !!filters.brand,
  });
  const models = modelsData ?? [];

  useEffect(() => { setFilters((f) => ({ ...f, model: "" })); }, [filters.brand]);

  const params = Object.fromEntries(Object.entries(applied).filter(([, v]) => v !== "" && v != null));
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["cars", applied],
    queryFn: ({ pageParam }) => api.getCars({ ...params, cursor: pageParam ?? undefined, limit: 24 }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting && hasNextPage) fetchNextPage(); });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const rawCars = data?.pages.flatMap((p) => p.items) ?? [];
  const cars = useMemo(() => sortCars(rawCars, sort), [rawCars, sort]);
  const hasActiveFilters = Object.values(applied).some((v) => v !== "" && v != null);
  const activeCount = Object.values(applied).filter((v) => v !== "" && v != null).length;

  function applyFilters() {
    const params = new URLSearchParams();
    FILTER_KEYS.forEach((k) => { const v = (filters as Record<string, string>)[k]; if (v) params.set(k, v); });
    setSearchParams(params, { replace: false });
    setFiltersOpen(false);
  }
  function clearFilters() { setFilters(empty); setSearchParams(new URLSearchParams(), { replace: false }); }

  const FilterPanel = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Filtre</p>
        {activeCount > 0 && (
          <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            <X size={12} /> Fjern alle
          </button>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Søk</label>
        <input placeholder="Navn eller modell…" value={filters.title ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, title: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Merke & Modell</label>
        <select value={filters.brand ?? ""} onChange={(e) => setFilters((f) => ({ ...f, brand: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">Alle merker</option>
          {brands.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select value={filters.model ?? ""} onChange={(e) => setFilters((f) => ({ ...f, model: e.target.value }))}
          disabled={!filters.brand}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-40">
          <option value="">Alle modeller</option>
          {models.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Årsmodell</label>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Fra" type="number" value={filters.year_min ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, year_min: e.target.value }))}
            className="border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <input placeholder="Til" type="number" value={filters.year_max ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, year_max: e.target.value }))}
            className="border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Pris (kr)</label>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Fra" type="number" value={filters.price_min ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, price_min: e.target.value }))}
            className="border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <input placeholder="Til" type="number" value={filters.price_max ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, price_max: e.target.value }))}
            className="border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Km</label>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Min km" type="number" value={filters.mileage_min ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, mileage_min: e.target.value }))}
            className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <input placeholder="Maks km" type="number" value={filters.mileage_max ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, mileage_max: e.target.value }))}
            className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Drivstoff</label>
        <select value={filters.fuel_type ?? ""} onChange={(e) => setFilters((f) => ({ ...f, fuel_type: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">Alle</option>
          {FUEL_TYPES.map((ft) => <option key={ft}>{ft}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Girkasse</label>
        <select value={filters.transmission ?? ""} onChange={(e) => setFilters((f) => ({ ...f, transmission: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">Alle</option>
          {TRANSMISSIONS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Drivlinje</label>
        <select value={filters.drivetrain ?? ""} onChange={(e) => setFilters((f) => ({ ...f, drivetrain: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">Alle</option>
          {DRIVETRAINS.map((d) => <option key={d} value={d}>{DRIVETRAIN_LABELS[d]}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Selgertype</label>
        <select value={filters.seller_type ?? ""} onChange={(e) => setFilters((f) => ({ ...f, seller_type: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">Alle</option>
          <option value="private">Privat</option>
          <option value="dealer">Forhandler</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Hestekrefter</label>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Min hk" type="number" value={filters.horsepower_min ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, horsepower_min: e.target.value }))}
            className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <input placeholder="Maks hk" type="number" value={filters.horsepower_max ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, horsepower_max: e.target.value }))}
            className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Maks antall eiere</label>
        <input placeholder="f.eks. 2" type="number" value={filters.num_owners_max ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, num_owners_max: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Maks månedskost (kr/mnd)</label>
        <input placeholder="f.eks. 5000" type="number" value={filters.monthly_cost_max ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, monthly_cost_max: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Annonnsetype</label>
        <select value={filters.listing_type ?? ""} onChange={(e) => setFilters((f) => ({ ...f, listing_type: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">Alle</option>
          <option value="buy_now">Kjøp nå</option>
          <option value="auction">Auksjon</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Tilstand</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={filters.is_norwegian_reg === "true"}
              onChange={(e) => setFilters((f) => ({ ...f, is_norwegian_reg: e.target.checked ? "true" : "" }))}
              className="rounded border-slate-600 bg-slate-800 accent-amber-500" />
            <span className="text-sm text-slate-300">Norsk registrert</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={filters.has_service_history === "true"}
              onChange={(e) => setFilters((f) => ({ ...f, has_service_history: e.target.checked ? "true" : "" }))}
              className="rounded border-slate-600 bg-slate-800 accent-amber-500" />
            <span className="text-sm text-slate-300">Servicehistorikk</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={filters.accident_free === "true"}
              onChange={(e) => setFilters((f) => ({ ...f, accident_free: e.target.checked ? "true" : "" }))}
              className="rounded border-slate-600 bg-slate-800 accent-amber-500" />
            <span className="text-sm text-slate-300">Ulykkefri</span>
          </label>
        </div>
      </div>

      <button onClick={applyFilters}
        className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors">
        Vis resultater
      </button>

      {hasActiveFilters && (
        <button onClick={() => navigate("/alerts", { state: { prefill: applied } })}
          className="w-full flex items-center justify-center gap-2 border border-blue-300 text-amber-400 rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-50 transition-colors">
          <Bell size={14} /> Abonner på søket
        </button>
      )}
    </div>
  );

  const SORT_OPTIONS: { key: SortMode; label: string }[] = [
    { key: "newest", label: "Nyeste" },
    { key: "price_asc", label: "Lavest pris" },
    { key: "price_desc", label: "Høyest pris" },
    { key: "discount", label: "Beste deal" },
    { key: "auctions", label: "Auksjoner først" },
  ];

  return (
    <div className="flex gap-6">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-700 text-slate-100 px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}
      {/* Desktop filter sidebar */}
      <aside className="hidden lg:block w-[260px] shrink-0">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 sticky top-4">
          <FilterPanel />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Top bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Mobile filter toggle */}
          <button onClick={() => setFiltersOpen((v) => !v)}
            className="lg:hidden flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700/50">
            <SlidersHorizontal size={15} />
            Filtre {activeCount > 0 && <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">{activeCount}</span>}
          </button>

          {/* Sort pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {SORT_OPTIONS.map((o) => (
              <button key={o.key} onClick={() => setSort(o.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  sort === o.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white border-slate-700 text-slate-400 hover:bg-slate-700/50"
                }`}>
                {o.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-500 ml-auto">
            {rawCars.length} annonser
          </span>
        </div>

        {/* Mobile filter panel */}
        {filtersOpen && (
          <div className="lg:hidden bg-slate-800 rounded-xl border border-slate-700 p-4">
            <FilterPanel />
          </div>
        )}

        {isLoading && <p className="text-slate-400">Laster…</p>}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cars.map((car) => <CarCard key={car.id} car={car} savedIds={savedIds} onToggleSave={handleToggleSave} compareIds={compareIds} onToggleCompare={handleToggleCompare} />)}
        </div>

        <div ref={loaderRef} className="h-8 flex items-center justify-center">
          {isFetchingNextPage && <span className="text-sm text-slate-500">Laster mer…</span>}
          {!hasNextPage && cars.length > 0 && (
            <span className="text-xs text-slate-500">Ingen flere resultater</span>
          )}
        </div>
      </div>
    </div>
  );
}
