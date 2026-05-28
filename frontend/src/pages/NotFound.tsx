import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <p className="text-6xl font-bold text-amber-400">404</p>
        <p className="text-xl font-semibold text-slate-100">Siden finnes ikke</p>
        <p className="text-slate-400 text-sm">Siden du leter etter eksisterer ikke.</p>
        <Link to="/" className="inline-block text-sm text-amber-400 hover:text-amber-300 underline">
          Tilbake til forsiden
        </Link>
      </div>
    </div>
  );
}
