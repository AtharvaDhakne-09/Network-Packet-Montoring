import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import LiveMonitor from "./pages/LiveMonitor";
import Analytics from "./pages/Analytics";
import RouterSimulation from "./pages/RouterSimulation";
import BufferInspector from "./pages/BufferInspector";
import PolicyComparison from "./pages/PolicyComparison";
import History from "./pages/History";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/live" element={<LiveMonitor />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/simulation" element={<RouterSimulation />} />
        <Route path="/buffer" element={<BufferInspector />} />
        <Route path="/compare" element={<PolicyComparison />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}
