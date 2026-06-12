import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, ExternalLink, Heart } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api/client";
import BargainGauge from "../components/BargainGauge";

interface DealEvent {
  id: number;
  car_id: number;
  score: number;
  quality_tier: string | null;
  brand: string | null;
  model: string | null;
  price: number | null;
  image_url: string | null;
  detected_at: string | null;
  discount_pct: number;
}

const TIER_COLORS: Record<string, string> = {
  excellent: "bg-green-900/60 text-green-300 border-green-700",
  good: "bg-blue-900/60 text-blue-300 border-blue-700",
  check: "bg-amber-900/60 text-amber-300 border-amber-700",
};

function EventCard({ ev, onSave }: { ev: DealEvent; onSave: (id: number) => void }) {
  const tierCls = TIER_COLORS[ev.quality_tier ?? ""] ?? "bg-slate-700/60 text-slate-300 border-slate-600";
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex gap-3 p-3 animate-pulse-once">
      {ev.image_url && (
        <img src={ev.image_url} alt="" className="w-20 h-16 object-cover rounded-lg shrink-0" loading="lazy" decoding="async" />
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-semibold text-slate-100 text-sm truncate">{ev.brand} {ev.model}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {ev.price && <span className="text-sm font-bold text-slate-100">{ev.price.toLocaleString("no")} kr</span>}
          <span className={`text-xs px-1.5 py-0.5 rounded border ${tierCls}`}>{ev.quality_tier ?? "deal"}</span>
        </div>
        {ev.detected_at && (
          <p className="text-xs text-slate-500">{new Date(ev.detected_at).toLocaleTimeString("no")}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <BargainGauge score={ev.score} size="sm" />
        <div className="flex gap-1">
          <button onClick={() => onSave(ev.car_id)} title="Lagre" className="p-1.5 rounded hover:bg-slate-700 transition-colors">
            <Heart size={14} className="text-slate-400 hover:text-rose-400" />
          </button>
          <a href={`/cars/${ev.car_id}`} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-slate-700 transition-colors">
            <ExternalLink size={14} className="text-slate-400 hover:text-amber-400" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ArbitrageRadar() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [minDiscount, setMinDiscount] = useState(15);
  const [brand, setBrand] = useState("");
  const esRef = useRef<EventSource | null>(null);

  const isPro = user?.plan === "pro" || user?.plan === "dealer";

  function connect() {
    esRef.current?.close();
    const q = new URLSearchParams({ min_discount_pct: String(minDiscount) });
    if (brand) q.set("brand", brand);
    const token = localStorage.getItem("auth_token");
    // EventSource doesn't support custom headers — pass token via query param
    // (backend reads it from ?token= as a fallback for SSE)
    if (token) q.set("token", token);
    const es = new EventSource(`/api/v1/b2b/stream?${q}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "ping") return;
        setEvents((prev) => [data, ...prev].slice(0, 100));
      } catch {}
    };
    esRef.current = es;
  }

  useEffect(() => {
    return () => esRef.current?.close();
  }, []);

  function handleSave(carId: number) {
    if (!isAuthenticated) { navigate("/login"); return; }
    api.addToWatchlist(carId).catch(() => {});
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <Radio size={40} className="text-amber-400" />
        <h1 className="text-xl font-semibold text-slate-100">Arbitrage Radar</h1>
        <p className="text-slate-400 max-w-sm">Logg inn for å få tilgang til sanntids deal-strøm.</p>
        <button onClick={() => navigate("/login")} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg px-6 py-2.5 text-sm">Logg inn</button>
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <Radio size={40} className="text-amber-400" />
        <h1 className="text-xl font-semibold text-slate-100">Arbitrage Radar</h1>
        <p className="text-slate-400 max-w-sm">Sanntids varsling når nye deals oppdages. Krever Pro- eller Dealer-abonnement.</p>
        <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-full">Din plan: {user?.plan ?? "free"}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Radio size={20} className={connected ? "text-green-400" : "text-slate-500"} />
          <h1 className="text-xl font-semibold text-slate-100">Arbitrage Radar</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? "bg-green-900/40 text-green-400" : "bg-slate-700 text-slate-400"}`}>
            {connected ? "Tilkoblet" : "Frakoblet"}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Min rabatt</label>
            <select value={minDiscount} onChange={(e) => setMinDiscount(Number(e.target.value))}
              className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-100">
              {[5, 10, 15, 20, 25, 30].map((v) => <option key={v} value={v}>{v}%</option>)}
            </select>
          </div>
          <input placeholder="Merke (valgfritt)" value={brand} onChange={(e) => setBrand(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 w-36" />
          <button onClick={connect} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg px-4 py-1.5 text-sm">
            {connected ? "Oppdater" : "Start"}
          </button>
        </div>
      </div>

      {events.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm">
          {connected ? "Venter på nye deals…" : "Klikk «Start» for å lytte etter nye deals i sanntid."}
        </div>
      )}

      <div className="space-y-2">
        {events.map((ev) => <EventCard key={ev.id} ev={ev} onSave={handleSave} />)}
      </div>
    </div>
  );
}
