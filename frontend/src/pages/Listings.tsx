import { useState, useEffect, useRef, useMemo, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X, Bell, Heart, Plus, ChevronDown } from "lucide-react";
import { api, type Car, type CarFilters } from "../api/client";
import BargainGauge from "../components/BargainGauge";
import { useAuth } from "../contexts/AuthContext";
import { useCompare } from "../hooks/useCompare";

const FUEL_TYPES = ["Bensin", "Diesel", "El", "Hybrid bensin", "Ladbar hybrid"];
const TRANSMISSIONS = ["Manuell", "Automat"];
const DRIVETRAINS = ["fwd", "rwd", "awd", "4wd"];
const DRIVETRAIN_LABELS: Record<string, string> = { fwd: "Forhjul", rwd: "Bakhjul", awd: "AWD", "4wd": "4WD" };
const empty: CarFilters = {};

function euBadge(deadline: string | null) {
  if (!deadline) return null;
  const d = new Date(deadline);
  const now = new Date();
  const yr = 365.25 * 24 * 3600 * 1000;
  if (d < now) return { label: "EU utløpt", cls: "bg-red-100 text-red-700" };
  if (d.getTime() - now.getTime() < yr) return { label: "EU snart", cls: "bg-orange-100 text-orange-700" };
  return { label: "EU ok", cls: "bg-green-100 text-green-700" };
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
    <div className="flex flex-wrap gap-1">
      {green.map((l) => <span key={l} className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded">{l}</span>)}
      {red.map((l) => <span key={l} className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">{l}</span>)}
    </div>
  );
}

function ScoreChipBadges({ chips }: { chips: Car["score_chips"] }) {
  if (!chips || chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => {
        const cls =
          c.type === "green" ? "bg-green-50 text-green-700 border-green-200" :
          c.type === "red"   ? "bg-red-50 text-red-700 border-red-200" :
                               "bg-gray-100 text-gray-600 border-gray-200";
        return <span key={c.label} className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{c.label}</span>;
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
  const isSaved = savedIds.has(car.id);
  const isInCompare = compareIds.includes(car.id);

  return (
    <div className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all rounded flex overflow-hidden">
      {/* Image */}
      <a href={car.url} target="_blank" rel="noreferrer" className="shrink-0 w-44 sm:w-52 bg-gray-100 overflow-hidden">
        {car.image_url
          ? <img src={car.image_url} alt={car.title ?? ""} className="w-full h-full object-cover" loading="lazy" decoding="async" />
          : <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl font-bold select-none">{(car.brand ?? "?")[0]}</div>
        }
      </a>

      {/* Body */}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-between gap-1">
        <div className="space-y-0.5">
          {/* Badges row */}
          <div className="flex flex-wrap gap-1 mb-1">
            {car.listing_type === "auction" && (
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded uppercase tracking-wide">Auksjon</span>
            )}
            {car.is_norwegian_reg === false && (
              <span className="text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded uppercase tracking-wide">Import</span>
            )}
            {eu && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${eu.cls}`}>{eu.label}</span>}
          </div>

          <a href={`/cars/${car.id}`} className="block">
            <p className="font-semibold text-gray-900 text-sm leading-snug hover:text-blue-600 transition-colors line-clamp-2">{car.title}</p>
          </a>
          <p className="text-xs text-gray-500">
            {[car.year, car.mileage ? `${car.mileage.toLocaleString("no")} km` : null, car.fuel_type, car.transmission].filter(Boolean).join(" · ")}
          </p>
          {car.location && <p className="text-xs text-gray-400">{car.location}</p>}
        </div>

        <div className="space-y-1">
          <ConditionBadges signals={car.condition_signals ?? {}} />
          <ScoreChipBadges chips={car.score_chips ?? []} />
        </div>

        <div className="flex items-end justify-between pt-1">
          <div>
            <p className="text-lg font-bold text-gray-900 leading-none">{car.price?.toLocaleString("no")} kr</p>
            {car.price && <p className="text-[10px] text-gray-400 mt-0.5">~{Math.round(car.price / 60).toLocaleString("no")} kr/mnd</p>}
          </div>
          <div className="flex items-center gap-1.5">
            {car.outlier_score && <BargainGauge score={car.outlier_score.score} size="sm" />}
            <button onClick={(e) => { e.preventDefault(); onToggleSave(car); }} title={isSaved ? "Fjern fra lagret" : "Lagre"} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
              <Heart size={15} className={isSaved ? "text-rose-500 fill-rose-500" : "text-gray-400"} />
            </button>
            <button title={isInCompare ? "Fjern fra sammenligning" : "Sammenlign"} onClick={(e) => { e.preventDefault(); onToggleCompare(car); }} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
              <Plus size={15} className={isInCompare ? "text-blue-600" : "text-gray-400"} />
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
  if (mode === "auctions") return [...c.filter((x) => x.listing_type === "auction"), ...c.filter((x) => x.listing_type !== "auction")];
  return c;
}

const FILTER_KEYS: (keyof CarFilters)[] = [
  "brand", "model", "title", "year_min", "year_max", "price_min", "price_max",
  "mileage_min", "mileage_max", "fuel_type", "listing_type", "transmission",
  "seller_type", "drivetrain", "num_owners_max", "horsepower_min", "horsepower_max",
  "is_norwegian_reg", "has_service_history", "accident_free", "monthly_cost_max",
];

const inputCls = "w-full border border-gray-300 bg-white text-gray-900 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide";

export default function Listings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { ids: compareIds, add: addToCompare, remove: removeFromCompare } = useCompare();

  const applied = useMemo<CarFilters>(() => {
    const f: CarFilters = {};
    FILTER_KEYS.forEach((k) => { const v = searchParams.get(k); if (v) (f as Record<string, string>)[k] = v; });
    return f;
  }, [searchParams]);

  const [filters, setFilters] = useState<CarFilters>(() => {
    const f: CarFilters = {};
    FILTER_KEYS.forEach((k) => { const v = searchParams.get(k); if (v) (f as Record<string, string>)[k] = v; });
    return f;
  });
  const [sort, setSort] = useState<SortMode>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    api.getWatchlist().then((cars) => setSavedIds(new Set(cars.map((c) => c.id)))).catch(() => {});
  }, [isAuthenticated]);

  // Scroll to top when filters change so the loader div is off-screen,
  // preventing the IntersectionObserver from immediately fetching with a stale cursor.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [applied]);

  async function handleToggleSave(car: Car) {
    if (!isAuthenticated) { navigate("/login"); return; }
    const alreadySaved = savedIds.has(car.id);
    setSavedIds((prev) => { const next = new Set(prev); if (alreadySaved) next.delete(car.id); else next.add(car.id); return next; });
    try {
      if (alreadySaved) await api.removeFromWatchlist(car.id);
      else await api.addToWatchlist(car.id);
    } catch {
      setSavedIds((prev) => { const next = new Set(prev); if (alreadySaved) next.add(car.id); else next.delete(car.id); return next; });
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
    const p = new URLSearchParams();
    FILTER_KEYS.forEach((k) => { const v = (filters as Record<string, string>)[k]; if (v) p.set(k, v); });
    setSearchParams(p, { replace: false });
    setFiltersOpen(false);
  }
  function clearFilters() { setFilters(empty); setSearchParams(new URLSearchParams(), { replace: false }); }

  const FilterPanel = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-800">Filtre</p>
        {activeCount > 0 && (
          <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            <X size={12} /> Fjern alle ({activeCount})
          </button>
        )}
      </div>

      <div>
        <label className={labelCls}>Søk</label>
        <input placeholder="Tittel eller modell…" value={filters.title ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, title: e.target.value }))}
          className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Merke & Modell</label>
        <div className="space-y-1.5">
          <select value={filters.brand ?? ""} onChange={(e) => setFilters((f) => ({ ...f, brand: e.target.value }))} className={inputCls}>
            <option value="">Alle merker</option>
            {brands.map((b) => <option key={b}>{b}</option>)}
          </select>
          <select value={filters.model ?? ""} onChange={(e) => setFilters((f) => ({ ...f, model: e.target.value }))} disabled={!filters.brand} className={`${inputCls} disabled:opacity-40`}>
            <option value="">Alle modeller</option>
            {models.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Årsmodell</label>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Fra" type="number" value={filters.year_min ?? ""} onChange={(e) => setFilters((f) => ({ ...f, year_min: e.target.value }))} className={inputCls} />
          <input placeholder="Til" type="number" value={filters.year_max ?? ""} onChange={(e) => setFilters((f) => ({ ...f, year_max: e.target.value }))} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Pris (kr)</label>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Fra" type="number" value={filters.price_min ?? ""} onChange={(e) => setFilters((f) => ({ ...f, price_min: e.target.value }))} className={inputCls} />
          <input placeholder="Til" type="number" value={filters.price_max ?? ""} onChange={(e) => setFilters((f) => ({ ...f, price_max: e.target.value }))} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Kilometerstand</label>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Min km" type="number" value={filters.mileage_min ?? ""} onChange={(e) => setFilters((f) => ({ ...f, mileage_min: e.target.value }))} className={inputCls} />
          <input placeholder="Maks km" type="number" value={filters.mileage_max ?? ""} onChange={(e) => setFilters((f) => ({ ...f, mileage_max: e.target.value }))} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Drivstoff</label>
        <select value={filters.fuel_type ?? ""} onChange={(e) => setFilters((f) => ({ ...f, fuel_type: e.target.value }))} className={inputCls}>
          <option value="">Alle</option>
          {FUEL_TYPES.map((ft) => <option key={ft}>{ft}</option>)}
        </select>
      </div>

      <div>
        <label className={labelCls}>Girkasse</label>
        <select value={filters.transmission ?? ""} onChange={(e) => setFilters((f) => ({ ...f, transmission: e.target.value }))} className={inputCls}>
          <option value="">Alle</option>
          {TRANSMISSIONS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div>
        <label className={labelCls}>Drivlinje</label>
        <select value={filters.drivetrain ?? ""} onChange={(e) => setFilters((f) => ({ ...f, drivetrain: e.target.value }))} className={inputCls}>
          <option value="">Alle</option>
          {DRIVETRAINS.map((d) => <option key={d} value={d}>{DRIVETRAIN_LABELS[d]}</option>)}
        </select>
      </div>

      <div>
        <label className={labelCls}>Selgertype</label>
        <select value={filters.seller_type ?? ""} onChange={(e) => setFilters((f) => ({ ...f, seller_type: e.target.value }))} className={inputCls}>
          <option value="">Alle</option>
          <option value="private">Privat</option>
          <option value="dealer">Forhandler</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Hestekrefter</label>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Min hk" type="number" value={filters.horsepower_min ?? ""} onChange={(e) => setFilters((f) => ({ ...f, horsepower_min: e.target.value }))} className={inputCls} />
          <input placeholder="Maks hk" type="number" value={filters.horsepower_max ?? ""} onChange={(e) => setFilters((f) => ({ ...f, horsepower_max: e.target.value }))} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Maks antall eiere</label>
        <input placeholder="f.eks. 2" type="number" value={filters.num_owners_max ?? ""} onChange={(e) => setFilters((f) => ({ ...f, num_owners_max: e.target.value }))} className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Annonsetype</label>
        <select value={filters.listing_type ?? ""} onChange={(e) => setFilters((f) => ({ ...f, listing_type: e.target.value }))} className={inputCls}>
          <option value="">Alle</option>
          <option value="buy_now">Kjøp nå</option>
          <option value="auction">Auksjon</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Tilstand</label>
        <div className="space-y-2">
          {[
            { key: "is_norwegian_reg", label: "Norsk registrert" },
            { key: "has_service_history", label: "Servicehistorikk" },
            { key: "accident_free", label: "Ulykkefri" },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox"
                checked={(filters as Record<string, string>)[key] === "true"}
                onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked ? "true" : "" }))}
                className="rounded border-gray-300 accent-blue-600" />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <button onClick={applyFilters} className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors">
        Vis resultater
      </button>

      {hasActiveFilters && (
        <button onClick={() => navigate("/alerts", { state: { prefill: applied } })}
          className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 rounded px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
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
    { key: "auctions", label: "Auksjoner" },
  ];

  return (
    <div className="flex gap-6">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      {/* Desktop filter sidebar */}
      <aside className="hidden lg:block w-[240px] shrink-0">
        <div className="bg-white border border-gray-200 rounded p-4 sticky top-4">
          <FilterPanel />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Top bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setFiltersOpen((v) => !v)}
            className="lg:hidden flex items-center gap-2 bg-white border border-gray-300 rounded px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <SlidersHorizontal size={14} />
            Filtre {activeCount > 0 && <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">{activeCount}</span>}
            <ChevronDown size={12} />
          </button>

          <div className="flex items-center gap-1 flex-wrap">
            {SORT_OPTIONS.map((o) => (
              <button key={o.key} onClick={() => setSort(o.key)}
                className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                  sort === o.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}>
                {o.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-gray-400 ml-auto">
            {rawCars.length} annonser
          </span>
        </div>

        {/* Mobile filter panel */}
        {filtersOpen && (
          <div className="lg:hidden bg-white border border-gray-200 rounded p-4">
            <FilterPanel />
          </div>
        )}

        {isLoading && <p className="text-gray-400 text-sm py-8 text-center">Laster…</p>}

        {/* List */}
        <div className="space-y-2">
          {cars.map((car) => (
            <CarCard key={car.id} car={car} savedIds={savedIds} onToggleSave={handleToggleSave} compareIds={compareIds} onToggleCompare={handleToggleCompare} />
          ))}
        </div>

        <div ref={loaderRef} className="h-10 flex items-center justify-center">
          {isFetchingNextPage && <span className="text-sm text-gray-400">Laster mer…</span>}
          {!hasNextPage && cars.length > 0 && (
            <span className="text-xs text-gray-400 border-t border-gray-100 pt-3 w-full text-center block">Ingen flere resultater</span>
          )}
        </div>
      </div>
    </div>
  );
}
