import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { api, type Alert, type AlertCreate, type CarFilters } from "../api/client";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";

const FUEL_TYPES = ["Bensin", "Diesel", "El", "Hybrid bensin", "Ladbar hybrid"];
const DISCOUNT_OPTIONS = [
  { label: "Alle treff", value: null },
  { label: "10%+ under markedspris", value: 10 },
  { label: "20%+ under markedspris", value: 20 },
  { label: "30%+ under markedspris", value: 30 },
  { label: "40%+ under markedspris", value: 40 },
];

interface FormState {
  alert_name: string;
  brand: string;
  model: string;
  year_min: string;
  year_max: string;
  price_max: string;
  mileage_max: string;
  fuel_type: string;
  min_discount_pct: number | null;
  req_service_history: boolean;
  req_warranty: boolean;
  req_no_accident: boolean;
}

const emptyForm: FormState = {
  alert_name: "", brand: "", model: "", year_min: "", year_max: "",
  price_max: "", mileage_max: "", fuel_type: "", min_discount_pct: null,
  req_service_history: false, req_warranty: false, req_no_accident: false,
};

function filtersToForm(f: CarFilters): Partial<FormState> {
  return {
    brand: f.brand ?? "", model: f.model ?? "",
    year_min: f.year_min ?? "", year_max: f.year_max ?? "",
    price_max: f.price_max ?? "", mileage_max: f.mileage_max ?? "",
    fuel_type: f.fuel_type ?? "",
  };
}

const inputCls = "w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500";
const selectCls = "bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500";

export default function Alerts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");

  useEffect(() => {
    const prefill = (location.state as { prefill?: CarFilters } | null)?.prefill;
    if (prefill) setForm((f) => ({ ...f, ...filtersToForm(prefill) }));
  }, [location.state]);

  const { data: brandsData } = useQuery({ queryKey: ["brands"], queryFn: api.getBrands });
  const brands = brandsData?.map((b) => b.brand) ?? [];

  const { data: modelsData } = useQuery({
    queryKey: ["models", form.brand],
    queryFn: () => api.getModelsByBrand(form.brand),
    enabled: !!form.brand,
  });

  useEffect(() => { setForm((f) => ({ ...f, model: "" })); }, [form.brand]);

  const { data: alerts, isLoading, isError, refetch } = useQuery({
    queryKey: ["alerts"],
    queryFn: api.getAlerts,
  });

  const create = useMutation({
    mutationFn: api.createAlert,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alerts"] }); setForm(emptyForm); setError(""); },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => api.toggleAlert(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const remove = useMutation({
    mutationFn: api.deleteAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: AlertCreate = {};
    if (form.alert_name) body.alert_name = form.alert_name;
    if (form.brand) body.brand = form.brand;
    if (form.model) body.model = form.model;
    if (form.year_min) body.year_min = Number(form.year_min);
    if (form.year_max) body.year_max = Number(form.year_max);
    if (form.price_max) body.price_max = Number(form.price_max);
    if (form.mileage_max) body.mileage_max = Number(form.mileage_max);
    if (form.fuel_type) body.fuel_type = form.fuel_type;
    if (form.min_discount_pct != null) body.min_discount_pct = form.min_discount_pct;
    const extra: Record<string, unknown> = {};
    if (form.req_service_history) extra.has_service_history = true;
    if (form.req_warranty) extra.has_warranty = true;
    if (form.req_no_accident) extra.has_accident_history = false;
    if (Object.keys(extra).length > 0) body.extra_filters = extra;
    create.mutate(body);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Varsler</h1>
        {user && <span className="text-xs text-slate-500">{user.email}</span>}
      </div>

      <form onSubmit={submit} className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-4">
        <p className="text-sm font-medium text-slate-300">Opprett nytt varsel</p>
        {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

        <input placeholder="Varselnavn (valgfritt, f.eks. «Elbil Oslo»)" value={form.alert_name}
          onChange={(e) => setForm((f) => ({ ...f, alert_name: e.target.value }))} className={inputCls} />

        <div className="grid grid-cols-2 gap-3">
          <select value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} className={selectCls}>
            <option value="">Alle merker</option>
            {brands.map((b) => <option key={b}>{b}</option>)}
          </select>
          <select value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} disabled={!form.brand} className={`${selectCls} disabled:opacity-40`}>
            <option value="">Alle modeller</option>
            {(modelsData ?? []).map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <input placeholder="År fra" type="number" value={form.year_min} onChange={(e) => setForm((f) => ({ ...f, year_min: e.target.value }))} className={inputCls} />
          <input placeholder="År til" type="number" value={form.year_max} onChange={(e) => setForm((f) => ({ ...f, year_max: e.target.value }))} className={inputCls} />
          <input placeholder="Maks pris (kr)" type="number" value={form.price_max} onChange={(e) => setForm((f) => ({ ...f, price_max: e.target.value }))} className={inputCls} />
          <input placeholder="Maks km" type="number" value={form.mileage_max} onChange={(e) => setForm((f) => ({ ...f, mileage_max: e.target.value }))} className={inputCls} />
          <select value={form.fuel_type} onChange={(e) => setForm((f) => ({ ...f, fuel_type: e.target.value }))} className={selectCls}>
            <option value="">Alle drivstoff</option>
            {FUEL_TYPES.map((ft) => <option key={ft}>{ft}</option>)}
          </select>
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-2">Varsle kun når rabatten er…</p>
          <div className="flex flex-wrap gap-2">
            {DISCOUNT_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)} type="button"
                onClick={() => setForm((f) => ({ ...f, min_discount_pct: opt.value }))}
                className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${
                  form.min_discount_pct === opt.value
                    ? "bg-amber-500 text-slate-900 border-amber-500"
                    : "border-slate-600 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <details className="border border-slate-600 rounded-lg">
          <summary className="px-3 py-2 text-xs font-medium text-slate-400 cursor-pointer select-none">Avanserte krav (tilstandssignaler)</summary>
          <div className="px-3 pb-3 pt-1 space-y-2">
            {[
              { key: "req_service_history", label: "Krever servicehistorikk" },
              { key: "req_warranty", label: "Krever garanti" },
              { key: "req_no_accident", label: "Krever ulykkefri (bekreftet)" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(form as Record<string, unknown>)[key] as boolean}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                  className="rounded border-slate-600 bg-slate-800 accent-amber-500" />
                <span className="text-sm text-slate-300">{label}</span>
              </label>
            ))}
          </div>
        </details>

        <button type="submit" disabled={create.isPending} className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-semibold rounded-lg px-5 py-2 text-sm transition-colors">
          {create.isPending ? "Lagrer…" : "Opprett varsel"}
        </button>
      </form>

      <div className="space-y-2">
        {isLoading && <p className="text-slate-400 text-sm">Laster…</p>}
        {isError && <ErrorState retry={() => refetch()} />}
        {!isLoading && !isError && alerts?.length === 0 && (
          <EmptyState title="Ingen varsler ennå" message="Opprett et varsel ovenfor for å bli varslet om gode bilkjøp." />
        )}
        {alerts?.map((a: Alert) => (
          <div key={a.id} className={`bg-slate-800 rounded-xl border p-4 flex items-start justify-between gap-4 ${a.is_active ? "border-slate-700" : "border-slate-800 opacity-60"}`}>
            <div className="text-sm space-y-0.5 min-w-0">
              {a.alert_name && <p className="text-xs font-semibold text-amber-400">{a.alert_name}</p>}
              <p className="font-medium text-slate-200">
                {[a.brand, a.model, a.year_min && `fra ${a.year_min}`, a.year_max && `til ${a.year_max}`, a.price_max && `≤${a.price_max.toLocaleString("no")} kr`, a.mileage_max && `≤${a.mileage_max.toLocaleString("no")} km`, a.fuel_type].filter(Boolean).join(" · ") || "Alle biler"}
              </p>
              {a.min_discount_pct && (
                <span className="inline-block text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">
                  ≥{a.min_discount_pct}% under markedspris
                </span>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => toggle.mutate({ id: a.id, is_active: !a.is_active })} className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${a.is_active ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "bg-amber-500 text-slate-900 border-amber-500 hover:bg-amber-400"}`}>
                {a.is_active ? "Pause" : "Gjenoppta"}
              </button>
              <button onClick={() => remove.mutate(a.id)} className="text-xs px-3 py-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/20 transition-colors">
                Slett
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
