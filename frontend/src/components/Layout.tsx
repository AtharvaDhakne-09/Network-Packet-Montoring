import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Boxes,
  GitCompareArrows,
  History as HistoryIcon,
  LayoutDashboard,
  Radio,
  Router,
  Settings as SettingsIcon,
} from "lucide-react";
import CaptureControls from "./CaptureControls";

const NAV_ITEMS = [
  { to: "/overview", label: "Overview Dashboard", icon: LayoutDashboard },
  { to: "/live", label: "Live Packet Monitor", icon: Radio },
  { to: "/analytics", label: "Network Analytics", icon: BarChart3 },
  { to: "/simulation", label: "Router Simulation", icon: Router },
  { to: "/buffer", label: "Buffer Inspector", icon: Boxes },
  { to: "/compare", label: "Policy Comparison", icon: GitCompareArrows },
  { to: "/history", label: "Packet History", icon: HistoryIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const TITLES: Record<string, string> = {
  "/overview": "Overview Dashboard",
  "/live": "Live Packet Monitor",
  "/analytics": "Network Analytics",
  "/simulation": "Router Simulation",
  "/buffer": "Buffer Inspector",
  "/compare": "Policy Comparison",
  "/history": "Packet History",
  "/settings": "Settings",
};

export default function Layout() {
  const location = useLocation();
  const title = TITLES[location.pathname] ?? "Network Traffic Lab";

  return (
    <div className="flex h-full min-h-screen bg-surface-950">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-surface-700/70 bg-surface-900/80 md:flex">
        <div className="flex items-center gap-2 border-b border-surface-700/70 px-4 py-4">
          <div className="rounded-lg bg-accent/15 p-2 text-accent">
            <Activity size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">Network Traffic Lab</p>
            <p className="text-[11px] text-slate-500">Packet monitor · Router simulator</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-accent/15 text-accent"
                    : "text-slate-400 hover:bg-surface-800 hover:text-slate-200"
                }`
              }
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-surface-700/70 px-4 py-3 text-[11px] text-slate-500">
          <p>Backend: 127.0.0.1:8000</p>
          <p>API docs: /docs</p>
          <p className="mt-1">Metadata only. No payload capture.</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-surface-700/70 bg-surface-900/90 px-4 py-3 backdrop-blur">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-base font-semibold text-slate-100">{title}</h1>
              <nav className="flex gap-1 md:hidden">
                {NAV_ITEMS.slice(0, 4).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `rounded p-1 ${isActive ? "text-accent" : "text-slate-500"}`
                    }
                    title={item.label}
                  >
                    <item.icon size={16} />
                  </NavLink>
                ))}
              </nav>
            </div>
            <CaptureControls compact />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
