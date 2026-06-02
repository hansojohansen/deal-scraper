import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, X, Bookmark, RotateCcw } from "lucide-react";
import { api, type Outlier, type ScoreChip } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

const SWIPE_THRESHOLD = 80;
const FLY_DISTANCE = 600;

function ScoreChips({ chips }: { chips: ScoreChip[] }) {
  if (!chips?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {chips.slice(0, 4).map((c) => {
        const cls = c.type === "green" ? "bg-green-900/50 text-green-400"
          : c.type === "red" ? "bg-red-900/50 text-red-400"
          : "bg-slate-700 text-slate-400";
        return <span key={c.label} className={`text-[10px] px-2 py-0.5 rounded ${cls}`}>{c.label}</span>;
      })}
    </div>
  );
}

function DealCard({
  outlier,
  dragX,
  isDragging,
  isFlying,
  onPointerDown,
  isBackground,
}: {
  outlier: Outlier;
  dragX: number;
  isDragging: boolean;
  isFlying: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  isBackground?: boolean;
}) {
  const ref = outlier.fair_value ?? outlier.peer_avg_price;
  const discount = ref > 0 ? Math.round(Math.abs((outlier.price ?? 0) / ref - 1) * 100) : 0;
  const monthly = outlier.price ? Math.round(outlier.price / 60) : null;

  const likeOpacity = Math.max(0, Math.min(1, dragX / SWIPE_THRESHOLD));
  const passOpacity = Math.max(0, Math.min(1, -dragX / SWIPE_THRESHOLD));

  const rotate = isBackground ? 0 : dragX * 0.06;
  const scale = isBackground ? 0.96 : 1;
  const translateY = isBackground ? 10 : 0;
  const transition = (!isDragging || isFlying) ? "transform 0.3s ease-out" : "none";

  return (
    <div
      className={`bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden w-full max-w-sm mx-auto shadow-2xl select-none relative ${isBackground ? "pointer-events-none opacity-80" : "cursor-grab active:cursor-grabbing"}`}
      style={{
        transform: `translateX(${dragX}px) rotate(${rotate}deg) scale(${scale}) translateY(${translateY}px)`,
        transition,
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
    >
      {/* Like overlay */}
      {!isBackground && (
        <div
          className="absolute inset-0 z-10 pointer-events-none flex items-start justify-end p-5"
          style={{ opacity: likeOpacity }}
        >
          <span className="border-4 border-green-400 text-green-400 font-black text-2xl px-3 py-1 rounded-lg"
            style={{ transform: "rotate(-15deg)" }}>
            LIKT ♥
          </span>
        </div>
      )}
      {/* Pass overlay */}
      {!isBackground && (
        <div
          className="absolute inset-0 z-10 pointer-events-none flex items-start justify-start p-5"
          style={{ opacity: passOpacity }}
        >
          <span className="border-4 border-rose-400 text-rose-400 font-black text-2xl px-3 py-1 rounded-lg"
            style={{ transform: "rotate(15deg)" }}>
            PASS ✕
          </span>
        </div>
      )}

      {/* Image */}
      {outlier.image_url ? (
        <img src={outlier.image_url} alt={outlier.title ?? ""} className="w-full h-48 object-cover" draggable={false} />
      ) : (
        <div className="h-48 bg-slate-700 flex items-center justify-center">
          <span className="text-slate-600 text-6xl font-bold">{(outlier.brand ?? "?")[0]}</span>
        </div>
      )}

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
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFlying, setIsFlying] = useState(false);

  const dragStart = useRef<{ x: number; pointerId: number } | null>(null);

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

  const flyOff = useCallback((direction: "right" | "left", onDone: () => void) => {
    setIsFlying(true);
    setDragX(direction === "right" ? FLY_DISTANCE : -FLY_DISTANCE);
    setTimeout(() => {
      setDragX(0);
      setIsFlying(false);
      onDone();
    }, 280);
  }, []);

  const advance = useCallback((action: "like" | "pass" | "save") => {
    const current = outliers[index];
    if (!current) return;

    if (action === "save") {
      if (!user) { showToast("Logg inn for å lagre"); return; }
      saveMutation.mutate(current.car_id, {
        onSuccess: () => showToast("Lagret!"),
        onError: () => showToast("Allerede lagret"),
      });
    }
    if (action === "like") showToast("Likt!");

    flyOff(action === "pass" ? "left" : "right", () => {
      setHistory((h) => [...h, index]);
      setIndex((i) => i + 1);
    });
  }, [index, outliers, user, saveMutation, flyOff]);

  function undo() {
    if (!history.length || isFlying) return;
    setIndex(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isFlying) return;
    dragStart.current = { x: e.clientX, pointerId: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  }, [isFlying]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current || dragStart.current.pointerId !== e.pointerId) return;
    setDragX(e.clientX - dragStart.current.x);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current || dragStart.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragStart.current.x;
    dragStart.current = null;
    setIsDragging(false);

    if (dx > SWIPE_THRESHOLD) advance("like");
    else if (dx < -SWIPE_THRESHOLD) advance("pass");
    else setDragX(0);
  }, [advance]);

  if (isLoading) return <p className="text-slate-400 text-center mt-20">Laster…</p>;

  const current = outliers[index];
  const next = outliers[index + 1];

  return (
    <div className="flex flex-col items-center gap-6 py-4 max-w-sm mx-auto">
      <div className="flex items-center justify-between w-full">
        <h1 className="text-xl font-bold text-slate-100">Oppdag</h1>
        <span className="text-sm text-slate-500">{Math.min(index + 1, outliers.length)} / {outliers.length}</span>
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
          {/* Card stack — background card + draggable foreground card */}
          <div
            className="relative w-full"
            style={{ height: 430 }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {next && (
              <div className="absolute inset-0">
                <DealCard outlier={next} dragX={0} isDragging={false} isFlying={false} isBackground />
              </div>
            )}
            <div className="absolute inset-0">
              <DealCard
                outlier={current}
                dragX={dragX}
                isDragging={isDragging}
                isFlying={isFlying}
                onPointerDown={onPointerDown}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-6">
            <button onClick={undo} disabled={!history.length || isFlying}
              className="p-3 rounded-full border border-slate-600 text-slate-400 hover:bg-slate-700 disabled:opacity-30 transition-colors"
              title="Angre">
              <RotateCcw size={18} />
            </button>
            <button onClick={() => advance("pass")} disabled={isFlying}
              className="p-4 rounded-full border-2 border-rose-500 text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
              title="Pass">
              <X size={24} />
            </button>
            <button onClick={() => advance("like")} disabled={isFlying}
              className="p-4 rounded-full border-2 border-green-500 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
              title="Lik">
              <Heart size={24} />
            </button>
            <button onClick={() => advance("save")} disabled={isFlying}
              className="p-3 rounded-full border border-amber-500 text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
              title="Lagre til favoritter">
              <Bookmark size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
