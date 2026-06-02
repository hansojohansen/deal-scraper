import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, ExternalLink } from "lucide-react";
import { api, type Car } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

function WatchlistCard({ car }: { car: Car }) {
  const monthlyCost = car.price ? Math.round(car.price / 60) : null;
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
      {car.image_url ? (
        <img src={car.image_url} alt={car.title ?? ""} className="w-full h-[120px] object-cover" />
      ) : (
        <div className="h-[120px] bg-slate-700 flex items-center justify-center">
          <span className="text-4xl font-bold text-slate-600 select-none">{(car.brand?.trim() || "?")[0].toUpperCase()}</span>
        </div>
      )}
      <div className="p-3 space-y-1.5 flex-1 flex flex-col">
        <a href={`/cars/${car.id}`} className="hover:text-amber-400 transition-colors">
          <p className="font-semibold text-slate-100 text-sm leading-tight line-clamp-1">{car.title}</p>
        </a>
        <p className="text-xs text-slate-400">
          {car.year} · {car.mileage?.toLocaleString("no")} km
          {car.fuel_type ? ` · ${car.fuel_type}` : ""}
        </p>
        {car.score_chips && car.score_chips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {car.score_chips.map((c) => {
              const cls = c.type === "green" ? "bg-green-900/50 text-green-400" :
                          c.type === "red"   ? "bg-red-900/50 text-red-400" :
                                               "bg-slate-700 text-slate-400";
              return <span key={c.label} className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{c.label}</span>;
            })}
          </div>
        )}
        <div className="mt-auto pt-2 flex items-end justify-between">
          <div>
            <p className="font-bold text-slate-100">{car.price?.toLocaleString("no")} kr</p>
            {monthlyCost && (
              <p className="text-[10px] text-slate-500">~{monthlyCost.toLocaleString("no")} kr/mnd</p>
            )}
          </div>
          <a href={car.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors">
            <ExternalLink size={13} /> Se annonse
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Watchlist() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) navigate("/login", { state: { next: "/watchlist" } });
  }, [isAuthenticated, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: api.getWatchlist,
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bookmark size={20} className="text-amber-400" />
        <h1 className="text-xl font-semibold text-slate-100">
          Lagrede biler{data ? <span className="text-slate-500 font-normal text-base ml-2">({data.length})</span> : null}
        </h1>
      </div>

      {isLoading && <p className="text-slate-400">Laster…</p>}

      {!isLoading && data && data.length === 0 && (
        <div className="text-center py-16">
          <Bookmark size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Ingen biler lagret enda</p>
          <p className="text-slate-500 text-sm mt-1">Trykk på hjertet på en bil-annonse for å lagre den her.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {(data ?? []).map((car) => <WatchlistCard key={car.id} car={car} />)}
      </div>
    </div>
  );
}
