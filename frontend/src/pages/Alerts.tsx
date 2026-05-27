import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type AlertCreate } from "../api/client";

const empty: AlertCreate = { notify_email: "" };

export default function Alerts() {
  const qc = useQueryClient();
  const [form, setForm] = useState<AlertCreate & { price_max_s?: string; mileage_max_s?: string }>(empty);
  const [error, setError] = useState("");

  const { data: alerts, isLoading } = useQuery({ queryKey: ["alerts"], queryFn: api.getAlerts });

  const create = useMutation({
    mutationFn: api.createAlert,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alerts"] }); setForm(empty); setError(""); },
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
    if (!form.notify_email) return setError("Email is required");
    const body: AlertCreate = { notify_email: form.notify_email };
    if (form.brand) body.brand = form.brand;
    if (form.model) body.model = form.model;
    if (form.year_min) body.year_min = Number(form.year_min);
    if (form.year_max) body.year_max = Number(form.year_max);
    if (form.price_max_s) body.price_max = Number(form.price_max_s);
    if (form.mileage_max_s) body.mileage_max = Number(form.mileage_max_s);
    if (form.fuel_type) body.fuel_type = form.fuel_type;
    create.mutate(body);
  }

  const field = (key: string, placeholder: string, type = "text") => (
    <input placeholder={placeholder} type={type}
      value={(form as Record<string, string>)[key] ?? ""}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Deal Alerts</h1>

      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Create new alert</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {field("notify_email", "Email *")}
          {field("brand", "Brand")}
          {field("model", "Model")}
          {field("year_min", "Year from", "number")}
          {field("year_max", "Year to", "number")}
          {field("price_max_s", "Max price (kr)", "number")}
          {field("mileage_max_s", "Max mileage (km)", "number")}
          {field("fuel_type", "Fuel type")}
        </div>
        <button type="submit" disabled={create.isPending}
          className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {create.isPending ? "Saving…" : "Create alert"}
        </button>
      </form>

      <div className="space-y-2">
        {isLoading && <p className="text-gray-500 text-sm">Loading…</p>}
        {alerts?.map((a) => (
          <div key={a.id} className={`bg-white rounded-xl border p-4 flex items-start justify-between gap-4 ${a.is_active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
            <div className="text-sm space-y-0.5">
              <p className="font-medium text-gray-900">{a.notify_email}</p>
              <p className="text-gray-500">
                {[a.brand, a.model, a.year_min && `from ${a.year_min}`, a.year_max && `to ${a.year_max}`,
                  a.price_max && `≤${a.price_max.toLocaleString("no")} kr`,
                  a.mileage_max && `≤${a.mileage_max.toLocaleString("no")} km`,
                  a.fuel_type].filter(Boolean).join(" · ") || "Any car"}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => toggle.mutate({ id: a.id, is_active: !a.is_active })}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${a.is_active ? "border-gray-300 hover:bg-gray-50" : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"}`}>
                {a.is_active ? "Pause" : "Resume"}
              </button>
              <button onClick={() => remove.mutate(a.id)}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
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
