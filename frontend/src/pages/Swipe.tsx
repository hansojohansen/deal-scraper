import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, X, Bookmark, RotateCcw } from "lucide-react";
import { api, type Outlier, type ScoreChip } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

function ScoreChips({ chips }: { chips: ScoreChip[] }) {
  if (!chips?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {chips.slice(0, 4).map((c, i) => {
        const cls = c.type === "green" ? "bg-green-900/50 text-green-400"
          : c.type === "red" ? "bg-red-900/50 text-red-400"
          : "bg-slate-700 text-slate-400";
        return <span key={c.label} className={`text-[10px] px-2 py-0.5 rounded ${cls}`}>{c.label}</span>;
      })}
    </div>
  );
}

function DealCard({ outlier }: { outlier: Outlier }) {
  const ref = outlier.fair_value ?? outlier.peer_avg_price;
  const discount = Math.round(Math.abs((outlier.price ?? 0) / ref - 1) * 100);
  const monthly = outlier.price ? Math.round(outlier.price / 60) : null;

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden w-full max-w-sm mx-auto shadow-2xl">
      <a href={outlier.url} target="_blank" rel="noreferrer">
        <div className="h-48 bg-slate-700 flex items-center justify-center">
          <span className="text-slate-500 text-6xl font-bold opacity-20">
            {(outlier.brand ?? "?")[0]}
          </span>
        </div>
      </a>
      <div className="p-5 space-y-3">
        <div className="text-center">
          <p className="font-bold text-slate-100 text-lg">{outlier.title ?? `${outlier.brand} ${outlier.model}`}</p>
          <p className="text-slate-400 text-sm">{outlier.year} · {outlier.mileage?.toLocaleString("no")} km</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-100">{outlier.price?.toLocaleString("no")} kr</p>
          {monthly && <p className="text-xs text-slate-500">~{monthly.toLocaleString("no")} kr/mnd</p>}
          <div className="flex items-center justify-center gap-2 mt-1">
            <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, (discount / 50) * 100)}%` }} />
            </div>
            <span className="text-green-400 font-bold text-sm">-{discount}%</span>
          </div>
        </div>
        <ScoreChips chips={outlier.score_chips ?? []} />
      </div>
    </div>
  );
}

export default function Swipe() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const { data: outliers = [], isLoading } = useQuery({
    queryKey: ["outliers-swipe"],
    queryFn: () => api.getOutliers(100),
  });

  const saveMutation = useMutation({
    mutationFn: (car_id: number) => api.addToWatchlist(car_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  function next() {
    setHistory((h) => [...h, index]);
    setIndex((i) => i + 1);
  }

  function undo() {
    if (!history.length) return;
    setIndex(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }

  function handleSave(o: Outlier) {
    if (!user) { showToast("Logg inn for å lagre"); return; }
    saveMutation.mutate(o.car_id, {
      onSuccess: () => showToast("Lagret!"),
      onError: () => showToast("Allerede lagret"),
    });
    next();
  }

  if (isLoading) return <p className="text-slate-400 text-center mt-20">Laster…</p>;

  const current = outliers[index];

  return (
    <div className="flex flex-col items-center gap-6 py-4 max-w-sm mx-auto">
      <div className="flex items-center justify-between w-full">
        <h1 className="text-xl font-bold text-slate-100">Oppdag</h1>
        <span className="text-sm text-slate-500">{index + 1} / {outliers.length}</span>
      </div>

      <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full transition-all"
          style={{ width: `${outliers.length ? (index / outliers.length) * 100 : 0}%` }} />
      </div>

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-slate-700 text-slate-100 px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      {!current ? (
        <div className="text-center py-20 space-y-4">
          <p className="text-4xl">🎉</p>
          <p className="text-slate-300 font-medium">Tomt for biler!</p>
          <p className="text-slate-500 text-sm">Du har sett gjennom alle dealene.</p>
          <button onClick={() => { setIndex(0); setHistory([]); }}
            className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg font-medium text-sm hover:bg-amber-400">
            Start på nytt
          </button>
        </div>
      ) : (
        <>
          <DealCard outlier={current} />
          <div className="flex items-center gap-6">
            <button onClick={undo} disabled={!history.length}
              className="p-3 rounded-full border border-slate-600 text-slate-400 hover:bg-slate-700 disabled:opacity-30 transition-colors"
              title="Angre">
              <RotateCcw size={18} />
            </button>
            <button onClick={next}
              className="p-4 rounded-full border-2 border-rose-500 text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Pass">
              <X size={24} />
            </button>
            <button onClick={() => { showToast("Likt!"); next(); }}
              className="p-4 rounded-full border-2 border-green-500 text-green-400 hover:bg-green-500/10 transition-colors"
              title="Lik">
              <Heart size={24} />
            </button>
            <button onClick={() => handleSave(current)}
              className="p-3 rounded-full border border-amber-500 text-amber-400 hover:bg-amber-500/10 transition-colors"
              title="Lagre til favoritter">
              <Bookmark size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
