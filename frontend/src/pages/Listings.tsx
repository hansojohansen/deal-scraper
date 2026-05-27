import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, type Car, type CarFilters } from "../api/client";

const FUEL_TYPES = ["Bensin", "Diesel", "El", "Hybrid bensin", "Ladbar hybrid"];
const empty: CarFilters = {};

function CarCard({ car }: { car: Car }) {
  const pct = car.outlier_score
    ? Math.round(Math.abs((car.price ?? 0) / car.outlier_score.peer_avg_price - 1) * 100)
    : null;
  return (
    <a
      href={car.url}
      target="_blank"
      rel="noreferrer"
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-400 transition-colors"
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{car.title}</p>
          <p className="text-sm text-gray-500">
            {car.year} · {car.mileage?.toLocaleString("no")} km · {car.fuel_type}
          </p>
          {car.location && <p className="text-xs text-gray-400">{car.location}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-gray-900">{car.price?.toLocaleString("no")} kr</p>
          {pct !== null && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
              -{pct}%
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

export default function Listings() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<CarFilters>(empty);
  const [applied, setApplied] = useState<CarFilters>(empty);
  const loaderRef = useRef<HTMLDivElement>(null);

  const { data: brandsData } = useQuery({
    queryKey: ["brands"],
    queryFn: api.getBrands,
  });
  const brands = brandsData?.map((b) => b.brand) ?? [];

  const { data: modelsData } = useQuery({
    queryKey: ["models", filters.brand],
    queryFn: () => api.getModelsByBrand(filters.brand!),
    enabled: !!filters.brand,
  });
  const models = modelsData ?? [];

  // Reset model when brand changes
  useEffect(() => {
    setFilters((f) => ({ ...f, model: "" }));
  }, [filters.brand]);

  const params = Object.fromEntries(Object.entries(applied).filter(([, v]) => v !== "" && v != null));

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["cars", applied],
    queryFn: ({ pageParam }) =>
      api.getCars({ ...params, cursor: pageParam ?? undefined, limit: 20 }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && hasNextPage) fetchNextPage();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const cars = data?.pages.flatMap((p) => p.items) ?? [];
  const hasActiveFilters = Object.values(applied).some((v) => v !== "" && v != null);

  function handleSearch() {
    setApplied({ ...filters });
  }

  function handleClear() {
    setFilters(empty);
    setApplied(empty);
  }

  function handleSubscribe() {
    navigate("/alerts", { state: { prefill: applied } });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Listings</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        {/* Row 1: title search full width */}
        <input
          placeholder="Search by name or model…"
          value={filters.title ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, title: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Row 2: brand + model dropdowns */}
        <div className="grid grid-cols-2 gap-3">
          <select
            value={filters.brand ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, brand: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All brands</option>
            {brands.map((b) => <option key={b}>{b}</option>)}
          </select>
          <select
            value={filters.model ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, model: e.target.value }))}
            disabled={!filters.brand}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
          >
            <option value="">All models</option>
            {models.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>

        {/* Row 3: year, price, mileage, fuel */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input
            placeholder="Year from"
            type="number"
            value={filters.year_min ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, year_min: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            placeholder="Year to"
            type="number"
            value={filters.year_max ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, year_max: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            placeholder="Price from (kr)"
            type="number"
            value={filters.price_min ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, price_min: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            placeholder="Price to (kr)"
            type="number"
            value={filters.price_max ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, price_max: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            placeholder="Max mileage (km)"
            type="number"
            value={filters.mileage_max ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, mileage_max: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filters.fuel_type ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, fuel_type: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All fuel types</option>
            {FUEL_TYPES.map((ft) => <option key={ft}>{ft}</option>)}
          </select>
          <button
            onClick={handleSearch}
            className="col-span-2 sm:col-span-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            Search
          </button>
          <button
            onClick={handleClear}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
          >
            Clear
          </button>
        </div>

        {/* Subscribe button — only when filters are active */}
        {hasActiveFilters && (
          <button
            onClick={handleSubscribe}
            className="w-full flex items-center justify-center gap-2 border border-blue-300 text-blue-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            <span>🔔</span> Subscribe to this search
          </button>
        )}
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}

      <div className="space-y-2">
        {cars.map((car) => <CarCard key={car.id} car={car} />)}
      </div>

      <div ref={loaderRef} className="h-8 flex items-center justify-center">
        {isFetchingNextPage && <span className="text-sm text-gray-400">Loading more…</span>}
        {!hasNextPage && cars.length > 0 && (
          <span className="text-xs text-gray-400">End of results</span>
        )}
      </div>
    </div>
  );
}
