import { useState } from "react";
import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Car, TrendingDown, BarChart2, Bell, Menu, X, LogOut } from "lucide-react";
import { useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Listings from "./pages/Listings";
import Outliers from "./pages/Outliers";
import Analytics from "./pages/Analytics";
import Alerts from "./pages/Alerts";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import MarketBar from "./components/MarketBar";

const nav = [
  { to: "/", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/listings", label: "Listings", Icon: Car },
  { to: "/outliers", label: "Deals", Icon: TrendingDown },
  { to: "/analytics", label: "Analytics", Icon: BarChart2 },
  { to: "/alerts", label: "Varsler", Icon: Bell },
];

function NavItems({ onClick }: { onClick?: () => void }) {
  return (
    <>
      {nav.map(({ to, label, Icon }) => (
        <NavLink
          key={to} to={to} end={to === "/"} onClick={onClick}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              isActive ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:bg-slate-700 hover:text-slate-100"
            }`
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </>
  );
}

function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-900 flex">
      <aside className="hidden lg:flex flex-col w-[220px] shrink-0 bg-slate-800 border-r border-slate-700 fixed inset-y-0 left-0 z-30">
        <div className="px-4 py-5 border-b border-slate-700">
          <span className="font-bold text-amber-400 text-lg tracking-tight">BilDeal</span>
          <span className="text-xs text-slate-500 block">Bilmarkedet live</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <NavItems />
        </nav>
        <div className="p-4 border-t border-slate-700 space-y-2">
          {user && (
            <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors w-full">
              <LogOut size={14} />
              Logg ut
            </button>
          )}
          <p className="text-xs text-slate-600">finn.no · auksjonen</p>
        </div>
      </aside>

      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileOpen(false)} />}

      <aside className={`lg:hidden fixed inset-y-0 left-0 w-64 bg-slate-800 border-r border-slate-700 z-50 flex flex-col transform transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
          <span className="font-bold text-amber-400 text-lg">BilDeal</span>
          <button onClick={() => setMobileOpen(false)} className="cursor-pointer"><X size={20} className="text-slate-400" /></button>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          <NavItems onClick={() => setMobileOpen(false)} />
        </nav>
        {user && (
          <div className="p-4 border-t border-slate-700">
            <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <LogOut size={14} />Logg ut
            </button>
          </div>
        )}
      </aside>

      <div className="flex-1 lg:ml-[220px] flex flex-col min-h-screen">
        <div className="lg:hidden flex items-center gap-3 bg-slate-800 border-b border-slate-700 px-4 h-14 shrink-0">
          <button onClick={() => setMobileOpen(true)} className="cursor-pointer"><Menu size={22} className="text-slate-400" /></button>
          <span className="font-bold text-amber-400">BilDeal</span>
        </div>
        <MarketBar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 text-slate-100">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/listings" element={<Listings />} />
            <Route path="/outliers" element={<Outliers />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/*" element={<MainLayout />} />
    </Routes>
  );
}
