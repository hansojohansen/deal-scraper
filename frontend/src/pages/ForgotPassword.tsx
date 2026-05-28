import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.auth.forgotPassword(email);
    } finally {
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-400">BilDeal</p>
          <p className="text-slate-400 text-sm mt-1">Tilbakestill passord</p>
        </div>
        {sent ? (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center space-y-3">
            <p className="text-slate-100 font-medium">Sjekk e-posten din</p>
            <p className="text-slate-400 text-sm">Hvis kontoen finnes, sendes en tilbakestillingslenke om kort tid. Lenken er gyldig i 30 minutter.</p>
            <Link to="/login" className="block text-sm text-amber-400 hover:text-amber-300">Tilbake til innlogging</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-medium">E-post</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-500"
                placeholder="deg@eksempel.com"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-semibold rounded-lg py-2 text-sm transition-colors"
            >
              {loading ? "Sender…" : "Send tilbakestillingslenke"}
            </button>
            <p className="text-center text-xs">
              <Link to="/login" className="text-amber-400 hover:text-amber-300">Tilbake til innlogging</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
