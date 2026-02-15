import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { Layout } from "./components/Layout";
import { RunOverview } from "./components/views/RunOverview";
import { MemberActivity } from "./components/views/MemberActivity";
import { TicketBoard } from "./components/views/TicketBoard";
import { CommitLog } from "./components/views/CommitLog";
import { BranchView } from "./components/views/BranchView";
import { SprintDashboard } from "./components/views/SprintDashboard";
import { ActivityView } from "./components/views/ActivityView";
import { TicketLifecycleView } from "./components/views/TicketLifecycleView";
import { PullRequestView } from "./components/views/PullRequestView";
import { AnalyticsView } from "./components/views/AnalyticsView";
import { StandupView } from "./components/views/StandupView";
import { SprintSummaryView } from "./components/views/SprintSummaryView";
import { fetchConfig, fetchSprints, fetchActiveSprint } from "./api";
import type { AppConfig, View, Sprint } from "./types";

function getHashView(): View {
  const hash = window.location.hash.replace("#", "").split("?")[0] ?? "";
  const valid: View[] = ["sprint", "standup", "activity", "analytics", "tickets", "lifecycle", "prs", "branches", "commits", "members", "runs", "sprint-summary"];
  if (valid.includes(hash as View)) return hash as View;
  return "sprint";
}

function getHashParam(key: string): string | null {
  const hash = window.location.hash;
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return null;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  return params.get(key);
}

function App() {
  const [view, setView] = useState<View>(getHashView);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([
      fetchConfig(),
      fetchSprints(),
      fetchActiveSprint(),
    ]).then(([cfg, sprintList, active]) => {
      setConfig(cfg);
      setSprints(sprintList);
      if (active) {
        setSelectedSprintId(active.id);
      } else if (sprintList.length > 0) {
        setSelectedSprintId(sprintList[0]!.id);
      }
    }).catch((err) => {
      setError(err?.message ?? "Failed to load dashboard");
    });
  }, []);

  useEffect(() => {
    const handler = () => setView(getHashView());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = (v: View) => {
    window.location.hash = v;
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-lg mb-2">Failed to load dashboard</div>
          <div className="text-gray-500 text-sm mb-4">{error}</div>
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId);

  return (
    <Layout
      currentView={view}
      onNavigate={navigate}
      sprints={sprints}
      selectedSprintId={selectedSprintId}
      onSelectSprint={setSelectedSprintId}
    >
      {view === "sprint" && selectedSprint && (
        <SprintDashboard config={config} sprint={selectedSprint} onNavigate={navigate} />
      )}
      {view === "sprint" && !selectedSprint && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <p className="text-gray-500 text-sm">No sprints found. Run a scan to sync sprint data from Jira.</p>
        </div>
      )}
      {view === "standup" && (
        <StandupView config={config} />
      )}
      {view === "activity" && (
        <ActivityView config={config} sprint={selectedSprint ?? null} />
      )}
      {view === "analytics" && (
        <AnalyticsView config={config} sprintId={selectedSprintId} />
      )}
      {view === "runs" && <RunOverview config={config} />}
      {view === "members" && <MemberActivity config={config} initialMember={getHashParam("name")} />}
      {view === "branches" && <BranchView config={config} sprintId={selectedSprintId} />}
      {view === "tickets" && <TicketBoard config={config} sprintId={selectedSprintId} />}
      {view === "lifecycle" && <TicketLifecycleView config={config} sprintId={selectedSprintId} />}
      {view === "prs" && <PullRequestView config={config} />}
      {view === "sprint-summary" && (
        <SprintSummaryView config={config} sprintId={selectedSprintId} sprints={sprints} />
      )}
      {view === "commits" && <CommitLog config={config} />}
    </Layout>
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(<App />);
