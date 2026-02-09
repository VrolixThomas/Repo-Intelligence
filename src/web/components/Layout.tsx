import { SprintSelector } from "./SprintSelector";
import type { View, Sprint } from "../types";

const primaryNav: { view: View; label: string; icon: string }[] = [
  { view: "sprint", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { view: "standup", label: "Standup", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { view: "activity", label: "Activity", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { view: "analytics", label: "Analytics", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" },
  { view: "sprint-summary", label: "Sprint Report", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { view: "tickets", label: "Tickets", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { view: "lifecycle", label: "Lifecycle", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { view: "prs", label: "Pull Requests", icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" },
  { view: "branches", label: "Branches", icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
];

const secondaryNav: { view: View; label: string; icon: string }[] = [
  { view: "commits", label: "Commits", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
  { view: "members", label: "Members", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zM12.75 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" },
  { view: "runs", label: "Runs", icon: "M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" },
];

interface Props {
  currentView: View;
  onNavigate: (view: View) => void;
  sprints: Sprint[];
  selectedSprintId: number | null;
  onSelectSprint: (sprintId: number | null) => void;
  children: React.ReactNode;
}

function NavButton({ item, currentView, onNavigate }: { item: typeof primaryNav[number]; currentView: View; onNavigate: (v: View) => void }) {
  return (
    <li>
      <button
        onClick={() => onNavigate(item.view)}
        className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
          currentView === item.view
            ? "bg-gray-700/70 text-white font-medium border-l-3 border-blue-400"
            : "text-gray-300 hover:bg-gray-800 hover:text-white border-l-3 border-transparent"
        }`}
      >
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
        </svg>
        {item.label}
      </button>
    </li>
  );
}

export function Layout({ currentView, onNavigate, sprints, selectedSprintId, onSelectSprint, children }: Props) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <nav className="w-60 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-700">
          <h1 className="text-lg font-bold tracking-tight">CodingSummary</h1>
          <p className="text-xs text-gray-400 mt-0.5">Activity Dashboard</p>
        </div>

        {/* Sprint Selector */}
        {sprints.length > 0 && (
          <div className="border-b border-gray-700">
            <SprintSelector
              sprints={sprints}
              selectedSprintId={selectedSprintId}
              onSelect={onSelectSprint}
            />
          </div>
        )}

        <ul className="flex-1 py-3">
          {primaryNav.map((item) => (
            <NavButton key={item.view} item={item} currentView={currentView} onNavigate={onNavigate} />
          ))}

          {/* Separator */}
          <li className="my-2 mx-5 border-t border-gray-700" />

          {secondaryNav.map((item) => (
            <NavButton key={item.view} item={item} currentView={currentView} onNavigate={onNavigate} />
          ))}
        </ul>

        <div className="p-4 border-t border-gray-700">
          <p className="text-[10px] text-gray-500">CodingSummary v1.0</p>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
