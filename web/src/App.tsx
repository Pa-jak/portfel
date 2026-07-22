import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Snapshots from "./pages/Snapshots";
import SnapshotEdit from "./pages/SnapshotEdit";
import Categories from "./pages/Categories";
import Debts from "./pages/Debts";
import Settings from "./pages/Settings";
import { initPwa } from "./lib/pwa";

const NAV = [
  { to: "/", label: "Pulpit", ico: "▤", end: true },
  { to: "/snapshot", label: "Snapshot", ico: "📅", end: false },
  { to: "/snapshots", label: "Snapshoty", ico: "🗓", end: false },
  { to: "/categories", label: "Kategorie", ico: "🏷", end: false },
  { to: "/debts", label: "Długi", ico: "💶", end: false },
  { to: "/settings", label: "Ustawienia", ico: "⚙", end: false },
];

export default function App() {
  useEffect(() => {
    // Register the PWA service worker. autoUpdate keeps new SW versions in the
    // background; the Settings page offers an explicit manual check too.
    initPwa(
      () => { /* new SW waiting — handled via manual check in Settings */ },
      () => { /* app ready for offline use */ },
    );
  }, []);

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">💰 portfel</div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span className="ico">{n.ico}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/snapshots" element={<Snapshots />} />
        <Route path="/snapshot" element={<SnapshotEdit />} />
        <Route path="/snapshot/:id" element={<SnapshotEdit />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/debts" element={<Debts />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <footer className="app-footer muted">v{__APP_VERSION__}</footer>
    </div>
  );
}