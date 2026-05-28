import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X, Bell } from "lucide-react";
import { api, type Car, type CarFilters } from "../api/client";

const FUEL_TYPES = ["Bensin", "Diesel", "El", "Hybrid bensin", "Ladbar hybrid"];
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

function CarCard({ car }: { car: Car }) {
  const discountPct = car.outlier_score
    ? Math.round(Math.abs((car.price ?? 0) / car.outlier_score.peer_avg_price - 1) * 100)
    : null;
  const eu = euBadge(car.eu_next_deadline);
  const initial = (car.brand ?? "?")[0].toUpperCase();
  const barW = discountPct ? Math.min(100, (discountPct / 40) * 100) : 0;

  return (
    <a href={car.url} target="_blank" rel="noreferrer"
      className="block bg-slate-800 rounded-xl border border-slate-700 hover:border-blue-400 hover:shadow-sm transition-all overflow-hidden">
      {/* Color header / image */}
      <div className={`relative h-[100px] ${car.image_url ? "" : brandColor(car.brand)} flex items-center justify-center overflow-hidden`}>
        {car.image_url
          ? <img src={car.image_url} alt={car.title ?? ""} className="w-full h-full object-cover" />
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

      {/* Card body */}
      <div className="p-3 space-y-1.5">
        <p className="font-semibold text-slate-100 text-sm leading-tight line-clamp-1">{car.title}</p>
        <p className="text-xs text-slate-400">
          {car.year} · {car.mileage?.toLocaleString("no")} km
          {car.fuel_type ? ` · ${car.fuel_type}` : ""}
        </p>
        {car.location && <p className="text-xs text-slate-500">{car.location}</p>}

        <div className="flex items-center justify-between pt-1">
          <p className="font-bold text-slate-100">{car.price?.toLocaleString("no")} kr</p>
          {discountPct !== null && (
            <div className="flex items-center gap-1.5">
              <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${barW}%` }} />
              </div>
              <span className="text-xs font-semibold text-green-400">-{discountPct}%</span>
            </div>
          )}
        </div>
      </div>
    </a>
  );
}

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

export default function Listings() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<CarFilters>(empty);
  const [applied, setApplied] = useState<CarFilters>(empty);
  const [sort, setSort] = useState<SortMode>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

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
  const cars = sortCars(rawCars, sort);
  const hasActiveFilters = Object.values(applied).some((v) => v !== "" && v != null);
  const activeCount = Object.values(applied).filter((v) => v !== "" && v != null).length;

  function applyFilters() { setApplied({ ...filters }); setFiltersOpen(false); }
  function clearFilters() { setFilters(empty); setApplied(empty); }

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
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Maks km</label>
        <input placeholder="f.eks. 100000" type="number" value={filters.mileage_max ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, mileage_max: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
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
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Annonnsetype</label>
        <select value={filters.listing_type ?? ""} onChange={(e) => setFilters((f) => ({ ...f, listing_type: e.target.value }))}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">Alle</option>
          <option value="buy_now">Kjøp nå</option>
          <option value="auction">Auksjon</option>
        </select>
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
          {cars.map((car) => <CarCard key={car.id} car={car} />)}
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
