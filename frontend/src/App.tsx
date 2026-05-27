import { Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Listings from "./pages/Listings";
import Outliers from "./pages/Outliers";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";

const nav = [
  { to: "/", label: "Dashboard" },
  { to: "/listings", label: "Listings" },
  { to: "/outliers", label: "Deals" },
  { to: "/analytics", label: "Analytics" },
  { to: "/alerts", label: "Alerts" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-blue-700 text-lg">BilDeal</span>
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? "text-blue-700" : "text-gray-600 hover:text-gray-900"}`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/outliers" element={<Outliers />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/alerts" element={<Alerts />} />
        </Routes>
      </main>
    </div>
  );
}
