import { useNavigate } from "react-router-dom";
import { GitCompare, X, Trash2 } from "lucide-react";
import { useCompare } from "../hooks/useCompare";

export default function CompareTray() {
  const { items, remove, clear } = useCompare();
  const navigate = useNavigate();

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-[90vw]">
      <GitCompare size={16} className="text-amber-400 shrink-0" />

      <div className="flex items-center gap-2 flex-wrap">
        {items.map((item) => (
          <span key={item.id} className="flex items-center gap-1 bg-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded-full">
            {item.title}
            <button onClick={() => remove(item.id)} className="text-slate-400 hover:text-slate-100 ml-0.5">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-1">
        <button
          onClick={() => navigate(`/compare?ids=${items.map((i) => i.id).join(",")}`)}
          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-xs rounded-lg transition-colors"
        >
          Sammenlign
        </button>
        <button onClick={clear} className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors" title="Rydd">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
