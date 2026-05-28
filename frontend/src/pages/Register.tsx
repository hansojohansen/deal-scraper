import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api/client";

export default function Register() {
  const { setTokenAndUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passordene stemmer ikke overens");
    if (password.length < 8) return setError("Passord må være minst 8 tegn");
    setLoading(true);
    try {
      await api.auth.register(email, password);
      const { access_token } = await api.auth.login(email, password);
      const user = await api.auth.getMe(access_token);
      setTokenAndUser(access_token, user);
      navigate("/alerts", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-400">BilDeal</p>
          <p className="text-slate-400 text-sm mt-1">Opprett konto</p>
        </div>
        <form onSubmit={submit} className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">E-post</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-500"
              placeholder="deg@eksempel.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Passord (min. 8 tegn)</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Bekreft passord</label>
            <input
              type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-semibold rounded-lg py-2 text-sm transition-colors"
          >
            {loading ? "Oppretter konto…" : "Opprett konto"}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500">
          Har du allerede konto?{" "}
          <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium">Logg inn</Link>
        </p>
      </div>
    </div>
  );
}
