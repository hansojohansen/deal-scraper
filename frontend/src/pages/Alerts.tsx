import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Alert, type AlertCreate, type CarFilters } from "../api/client";

const FUEL_TYPES = ["Bensin", "Diesel", "El", "Hybrid bensin", "Ladbar hybrid"];
const DISCOUNT_OPTIONS = [
  { label: "Any match", value: null },
  { label: "10%+ below market", value: 10 },
  { label: "20%+ below market", value: 20 },
  { label: "30%+ below market", value: 30 },
  { label: "40%+ below market", value: 40 },
];

interface FormState {
  notify_email: string;
  brand: string;
  model: string;
  year_min: string;
  year_max: string;
  price_max: string;
  mileage_max: string;
  fuel_type: string;
  min_discount_pct: number | null;
}

const emptyForm: FormState = {
  notify_email: "",
  brand: "",
  model: "",
  year_min: "",
  year_max: "",
  price_max: "",
  mileage_max: "",
  fuel_type: "",
  min_discount_pct: null,
};

function filtersToForm(f: CarFilters): Partial<FormState> {
  return {
    brand: f.brand ?? "",
    model: f.model ?? "",
    year_min: f.year_min ?? "",
    year_max: f.year_max ?? "",
    price_max: f.price_max ?? "",
    mileage_max: f.mileage_max ?? "",
    fuel_type: f.fuel_type ?? "",
  };
}

export default function Alerts() {
  const qc = useQueryClient();
  const location = useLocation();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");

  // Pre-fill from Listings "Subscribe to this search"
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
  const models = modelsData ?? [];

  useEffect(() => {
    setForm((f) => ({ ...f, model: "" }));
  }, [form.brand]);

  const { data: alerts, isLoading } = useQuery({ queryKey: ["alerts"], queryFn: api.getAlerts });

  const create = useMutation({
    mutationFn: api.createAlert,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alerts"] }); setForm(emptyForm); setError(""); },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.toggleAlert(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const remove = useMutation({
    mutationFn: api.deleteAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.notify_email) return setError("Email is required");
    const body: AlertCreate = { notify_email: form.notify_email };
    if (form.brand) body.brand = form.brand;
    if (form.model) body.model = form.model;
    if (form.year_min) body.year_min = Number(form.year_min);
    if (form.year_max) body.year_max = Number(form.year_max);
    if (form.price_max) body.price_max = Number(form.price_max);
    if (form.mileage_max) body.mileage_max = Number(form.mileage_max);
    if (form.fuel_type) body.fuel_type = form.fuel_type;
    if (form.min_discount_pct != null) body.min_discount_pct = form.min_discount_pct;
    create.mutate(body);
  }

  function discountLabel(pct: number | null) {
    if (!pct) return null;
    return `≥${pct}% below market`;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Deal Alerts</h1>

      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <p className="text-sm font-medium text-gray-700">Create new alert</p>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <input
          placeholder="Your email *"
          type="email"
          value={form.notify_email}
          onChange={(e) => setForm((f) => ({ ...f, notify_email: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="grid grid-cols-2 gap-3">
          <select
            value={form.brand}
            onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Any brand</option>
            {brands.map((b) => <option key={b}>{b}</option>)}
          </select>
          <select
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            disabled={!form.brand}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
          >
            <option value="">Any model</option>
            {models.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <input placeholder="Year from" type="number" value={form.year_min}
            onChange={(e) => setForm((f) => ({ ...f, year_min: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input placeholder="Year to" type="number" value={form.year_max}
            onChange={(e) => setForm((f) => ({ ...f, year_max: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input placeholder="Max price (kr)" type="number" value={form.price_max}
            onChange={(e) => setForm((f) => ({ ...f, price_max: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input placeholder="Max mileage (km)" type="number" value={form.mileage_max}
            onChange={(e) => setForm((f) => ({ ...f, mileage_max: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={form.fuel_type}
            onChange={(e) => setForm((f) => ({ ...f, fuel_type: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Any fuel type</option>
            {FUEL_TYPES.map((ft) => <option key={ft}>{ft}</option>)}
          </select>
        </div>

        {/* Deal quality selector */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Only alert me when deal is…</p>
          <div className="flex flex-wrap gap-2">
            {DISCOUNT_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setForm((f) => ({ ...f, min_discount_pct: opt.value }))}
                className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${
                  form.min_discount_pct === opt.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={create.isPending}
          className="w-full bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {create.isPending ? "Saving…" : "Create alert"}
        </button>
      </form>

      <div className="space-y-2">
        {isLoading && <p className="text-gray-500 text-sm">Loading…</p>}
        {alerts?.map((a: Alert) => (
          <div
            key={a.id}
            className={`bg-white rounded-xl border p-4 flex items-start justify-between gap-4 ${
              a.is_active ? "border-gray-200" : "border-gray-100 opacity-60"
            }`}
          >
            <div className="text-sm space-y-0.5 min-w-0">
              <p className="font-medium text-gray-900">{a.notify_email}</p>
              <p className="text-gray-500 truncate">
                {[
                  a.brand, a.model,
                  a.year_min && `from ${a.year_min}`,
                  a.year_max && `to ${a.year_max}`,
                  a.price_max && `≤${a.price_max.toLocaleString("no")} kr`,
                  a.mileage_max && `≤${a.mileage_max.toLocaleString("no")} km`,
                  a.fuel_type,
                ].filter(Boolean).join(" · ") || "Any car"}
              </p>
              {discountLabel(a.min_discount_pct) && (
                <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {discountLabel(a.min_discount_pct)}
                </span>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => toggle.mutate({ id: a.id, is_active: !a.is_active })}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                  a.is_active
                    ? "border-gray-300 hover:bg-gray-50"
                    : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                }`}
              >
                {a.is_active ? "Pause" : "Resume"}
              </button>
              <button
                onClick={() => remove.mutate(a.id)}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {alerts?.length === 0 && <p className="text-sm text-gray-400">No alerts yet.</p>}
      </div>
    </div>
  );
}
