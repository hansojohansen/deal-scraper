import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, ChevronRight, ChevronLeft, Trash2 } from "lucide-react";
import { api, type CrmLead, type LeadCreate } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

const STAGES: { key: string; label: string }[] = [
  { key: "lead", label: "Ny lead" },
  { key: "contact", label: "Kontakt" },
  { key: "negotiation", label: "Forhandling" },
  { key: "done", label: "Solgt" },
  { key: "lost", label: "Tapt" },
];

const STAGE_COLORS: Record<string, string> = {
  lead: "border-slate-600",
  contact: "border-blue-700",
  negotiation: "border-amber-700",
  done: "border-green-700",
  lost: "border-red-800",
};

const STAGE_HEADER: Record<string, string> = {
  lead: "text-slate-300",
  contact: "text-blue-400",
  negotiation: "text-amber-400",
  done: "text-green-400",
  lost: "text-red-400",
};

interface NewLeadForm {
  title: string;
  brand: string;
  model: string;
  year: string;
  price: string;
  notes: string;
  contact_name: string;
  contact_phone: string;
}

const EMPTY_FORM: NewLeadForm = {
  title: "", brand: "", model: "", year: "", price: "",
  notes: "", contact_name: "", contact_phone: "",
};

export default function CRM() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<NewLeadForm>(EMPTY_FORM);
  const dragId = useRef<number | null>(null);

  const isPro = user?.plan === "pro" || user?.plan === "dealer";

  const { data: leads = [], isLoading } = useQuery<CrmLead[]>({
    queryKey: ["crmLeads"],
    queryFn: api.crmListLeads,
    enabled: isPro,
  });

  const createMut = useMutation({
    mutationFn: (body: LeadCreate) => api.crmCreateLead(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crmLeads"] }); setShowNew(false); setForm(EMPTY_FORM); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) => api.crmUpdateLead(id, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crmLeads"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.crmDeleteLead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crmLeads"] }),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate({
      title: form.title || undefined,
      brand: form.brand || undefined,
      model: form.model || undefined,
      year: form.year ? parseInt(form.year) : undefined,
      price: form.price ? parseInt(form.price) : undefined,
      notes: form.notes || undefined,
      contact_name: form.contact_name || undefined,
      contact_phone: form.contact_phone || undefined,
    });
  }

  function moveStage(lead: CrmLead, dir: 1 | -1) {
    const idx = STAGES.findIndex((s) => s.key === lead.stage);
    const next = STAGES[idx + dir];
    if (next) updateMut.mutate({ id: lead.id, stage: next.key });
  }

  function onDrop(stage: string) {
    if (dragId.current != null) {
      updateMut.mutate({ id: dragId.current, stage });
      dragId.current = null;
    }
  }

  if (!isPro) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-slate-300 font-semibold">CRM krever Pro- eller Dealer-abonnement.</p>
        <p className="text-slate-500 text-sm">Oppgrader for å få tilgang til Kanban-board og lead-håndtering.</p>
      </div>
    );
  }

  const byStage = (stage: string) => leads.filter((l) => l.stage === stage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">CRM — Kanban</h1>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg text-sm transition-colors"
        >
          <Plus size={15} /> Ny lead
        </button>
      </div>

      {/* New lead modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowNew(false)} />
          <form
            onSubmit={handleCreate}
            className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-slate-100">Ny lead</h2>
              <button type="button" onClick={() => setShowNew(false)} className="text-slate-500 hover:text-slate-200"><X size={18} /></button>
            </div>
            {(["title", "brand", "model"] as const).map((f) => (
              <input key={f} placeholder={{ title: "Tittel / bilnavn", brand: "Merke", model: "Modell" }[f]}
                value={form[f]} onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500" />
            ))}
            <div className="flex gap-2">
              <input placeholder="År" type="number" value={form.year}
                onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                className="w-1/2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500" />
              <input placeholder="Pris (kr)" type="number" value={form.price}
                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                className="w-1/2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
            <input placeholder="Kontaktnavn" value={form.contact_name}
              onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <input placeholder="Kontakttelefon" value={form.contact_phone}
              onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <textarea placeholder="Notater" value={form.notes} rows={2}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
            <button type="submit" disabled={createMut.isPending}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-semibold rounded-lg text-sm transition-colors">
              {createMut.isPending ? "Lagrer…" : "Legg til"}
            </button>
          </form>
        </div>
      )}

      {isLoading && <p className="text-slate-400 text-sm">Laster leads…</p>}

      {/* Kanban board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map(({ key, label }) => (
          <div
            key={key}
            className={`flex-shrink-0 w-64 bg-slate-800 rounded-xl border-t-2 ${STAGE_COLORS[key]} p-3 space-y-2`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(key)}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-semibold uppercase tracking-wide ${STAGE_HEADER[key]}`}>{label}</span>
              <span className="text-xs text-slate-600 bg-slate-700/50 rounded px-1.5">{byStage(key).length}</span>
            </div>

            {byStage(key).map((lead) => {
              const stageIdx = STAGES.findIndex((s) => s.key === lead.stage);
              return (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={() => { dragId.current = lead.id; }}
                  className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-1.5 cursor-grab active:cursor-grabbing hover:border-slate-600 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-100 leading-snug">
                    {lead.title ?? [lead.brand, lead.model, lead.year].filter(Boolean).join(" ") || "Navnløs lead"}
                  </p>
                  {lead.price && (
                    <p className="text-xs text-amber-400 font-semibold">{lead.price.toLocaleString("no")} kr</p>
                  )}
                  {lead.contact_name && (
                    <p className="text-xs text-slate-500">{lead.contact_name}{lead.contact_phone ? ` · ${lead.contact_phone}` : ""}</p>
                  )}
                  {lead.notes && (
                    <p className="text-xs text-slate-500 line-clamp-2">{lead.notes}</p>
                  )}
                  <div className="flex items-center gap-1 pt-0.5">
                    <button onClick={() => moveStage(lead, -1)} disabled={stageIdx === 0}
                      className="p-1 rounded hover:bg-slate-700 disabled:opacity-20 text-slate-400 transition-colors">
                      <ChevronLeft size={13} />
                    </button>
                    <button onClick={() => moveStage(lead, 1)} disabled={stageIdx === STAGES.length - 1}
                      className="p-1 rounded hover:bg-slate-700 disabled:opacity-20 text-slate-400 transition-colors">
                      <ChevronRight size={13} />
                    </button>
                    <button onClick={() => { if (confirm("Slett lead?")) deleteMut.mutate(lead.id); }}
                      className="ml-auto p-1 rounded hover:bg-red-900/40 text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
