import { useState, useEffect } from "react";
import { fetchStandup } from "../../api";
import type { AppConfig, StandupMemberData } from "../../types";

interface Props {
  config: AppConfig;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0]!;
}

function formatDate(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "In Progress": "bg-blue-100 text-blue-700",
    "In Development": "bg-blue-100 text-blue-700",
    "In Review": "bg-purple-100 text-purple-700",
    "Code Review": "bg-purple-100 text-purple-700",
    "Done": "bg-green-100 text-green-700",
    "Closed": "bg-green-100 text-green-700",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function PRStateBadge({ state }: { state: string | null }) {
  if (!state) return null;
  const colors: Record<string, string> = {
    OPEN: "bg-green-100 text-green-700",
    MERGED: "bg-purple-100 text-purple-700",
    DECLINED: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[state] ?? "bg-gray-100 text-gray-600"}`}>
      {state}
    </span>
  );
}

function MemberStandupCard({ data }: { data: StandupMemberData }) {
  const hasYesterday = data.yesterday.commits.length > 0 || data.yesterday.ticketsMoved.length > 0 || data.yesterday.prsMerged.length > 0;
  const hasToday = data.today.activeBranches.length > 0 || data.today.activeTickets.length > 0 || data.today.openPRs.length > 0;
  const hasBlockers = data.blockers.stalePRs.length > 0 || data.blockers.idleTickets.length > 0;
  const isIdle = !hasYesterday && !hasToday;

  return (
    <div className={`bg-white rounded-xl border shadow-sm ${hasBlockers ? "border-red-200" : "border-gray-200"}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center text-sm font-medium">
            {data.member.name.charAt(0)}
          </div>
          <span className="font-semibold text-sm text-gray-900">{data.member.name}</span>
        </div>
        {isIdle && (
          <span className="text-xs text-gray-400">No recent activity</span>
        )}
        {hasBlockers && (
          <span className="text-xs text-red-500 font-medium">Blocked</span>
        )}
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 min-h-[120px]">
        {/* Yesterday */}
        <div className="p-3">
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Yesterday</h4>
          {!hasYesterday ? (
            <p className="text-xs text-gray-300">No activity</p>
          ) : (
            <div className="space-y-1.5">
              {data.yesterday.ticketsMoved.map((t, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium text-gray-700">{t.jiraKey}</span>
                  <span className="text-gray-400 mx-1">{t.fromStatus} -&gt; {t.toStatus}</span>
                </div>
              ))}
              {data.yesterday.prsMerged.map((pr, i) => (
                <div key={i} className="text-xs text-purple-600">
                  PR #{pr.prId} merged
                  <span className="text-gray-400 ml-1">({pr.repo})</span>
                </div>
              ))}
              {data.yesterday.summaries.slice(0, 2).map((s, i) => (
                <div key={i} className="text-xs text-gray-600">
                  <span className="font-medium">{s.jiraKey}:</span>{" "}
                  {s.summaryText.slice(0, 120)}{s.summaryText.length > 120 ? "..." : ""}
                </div>
              ))}
              {data.yesterday.commits.length > 0 && data.yesterday.summaries.length === 0 && (
                <div className="text-xs text-gray-500">
                  {data.yesterday.commits.length} commit{data.yesterday.commits.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Today */}
        <div className="p-3">
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Today</h4>
          {!hasToday ? (
            <p className="text-xs text-gray-300">Nothing in progress</p>
          ) : (
            <div className="space-y-1.5">
              {data.today.activeTickets.map((t, i) => (
                <div key={i} className="text-xs flex items-center gap-1">
                  <span className="font-medium text-gray-700">{t.jiraKey}</span>
                  <StatusBadge status={t.status} />
                  {t.summary && <span className="text-gray-400 truncate">{t.summary.slice(0, 50)}</span>}
                </div>
              ))}
              {data.today.activeBranches.filter((b) => !data.today.activeTickets.some((t) => t.jiraKey === b.jiraKey)).map((b, i) => (
                <div key={i} className="text-xs flex items-center gap-1">
                  <span className="text-gray-600 font-mono text-[11px]">{b.name.length > 30 ? b.name.slice(0, 27) + "..." : b.name}</span>
                  <PRStateBadge state={b.prState} />
                </div>
              ))}
              {data.today.openPRs.length > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  {data.today.openPRs.length} open PR{data.today.openPRs.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Blockers */}
        <div className={`p-3 ${hasBlockers ? "bg-red-50/50" : ""}`}>
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Blockers</h4>
          {!hasBlockers ? (
            <p className="text-xs text-gray-300">None</p>
          ) : (
            <div className="space-y-1.5">
              {data.blockers.stalePRs.map((pr, i) => (
                <div key={i} className="text-xs text-red-600">
                  PR #{pr.prId} open {Math.round(pr.ageHours / 24)}d
                  <span className="text-red-400 ml-1">({pr.repo})</span>
                </div>
              ))}
              {data.blockers.idleTickets.map((t, i) => (
                <div key={i} className="text-xs text-orange-600">
                  {t.jiraKey} idle {t.idleDays}d
                  {t.summary && <span className="text-orange-400 ml-1">{t.summary.slice(0, 40)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function StandupView({ config }: Props) {
  const [date, setDate] = useState(getToday);
  const [data, setData] = useState<StandupMemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStandup(date).then((result) => {
      setData(result);
    }).catch((err: any) => setError(err?.message ?? "Failed to load data")).finally(() => setLoading(false));
  }, [date]);

  const prevDay = () => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split("T")[0]!);
  };

  const nextDay = () => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().split("T")[0]!);
  };

  // Sort: members with activity first, then blockers, then idle
  const sorted = [...data].sort((a, b) => {
    const aScore = (a.blockers.stalePRs.length + a.blockers.idleTickets.length) * 100
      + a.yesterday.commits.length + a.today.activeTickets.length * 10;
    const bScore = (b.blockers.stalePRs.length + b.blockers.idleTickets.length) * 100
      + b.yesterday.commits.length + b.today.activeTickets.length * 10;
    return bScore - aScore;
  });

  const totalBlockers = data.reduce((s, d) => s + d.blockers.stalePRs.length + d.blockers.idleTickets.length, 0);
  const activeCount = data.filter((d) => d.yesterday.commits.length > 0 || d.today.activeTickets.length > 0).length;

  return (
    <div className="space-y-4">
      {/* Header with date nav */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Daily Standup</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active / {data.length} members
            {totalBlockers > 0 && <span className="text-red-500 ml-2">{totalBlockers} blocker{totalBlockers !== 1 ? "s" : ""}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevDay} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">{formatDate(date)}</span>
          <button onClick={nextDay} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {/* Member cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm h-40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((d) => (
            <MemberStandupCard key={d.member.name} data={d} />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
              <p className="text-gray-500 text-sm">No team members configured.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
