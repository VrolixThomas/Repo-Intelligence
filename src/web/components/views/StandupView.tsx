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

// ── Icons ────────────────────────────────────────────────────────────────

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-3.5 h-3.5"} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-3.5 h-3.5"} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-3 h-3"} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ── Member Card ──────────────────────────────────────────────────────────

function MemberStandupCard({ data, config }: { data: StandupMemberData; config: AppConfig }) {
  const hasYesterday = data.yesterday.commits.length > 0 || data.yesterday.ticketsMoved.length > 0 || data.yesterday.prsMerged.length > 0;
  const hasToday = data.today.activeBranches.length > 0 || data.today.activeTickets.length > 0 || data.today.openPRs.length > 0;
  const hasBlockers = data.blockers.stalePRs.length > 0 || data.blockers.idleTickets.length > 0;
  const isIdle = !hasYesterday && !hasToday;
  const blockerCount = data.blockers.stalePRs.length + data.blockers.idleTickets.length;

  return (
    <div className={`bg-white rounded-xl border shadow-sm ${hasBlockers ? "border-red-200" : "border-gray-200"}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white ${
            hasBlockers ? "bg-red-500" : isIdle ? "bg-gray-400" : "bg-gray-700"
          }`}>
            {data.member.name.charAt(0)}
          </div>
          <span className="font-semibold text-sm text-gray-900">{data.member.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {isIdle && (
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">Idle</span>
          )}
          {hasBlockers && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded">
              <WarningIcon className="w-3 h-3" />
              {blockerCount} blocker{blockerCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Blockers banner — top-level if any */}
      {hasBlockers && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-100 rounded-lg p-3 space-y-2">
          {data.blockers.stalePRs.map((pr, i) => (
            <div key={i} className="flex items-start gap-2">
              <ClockIcon className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
              <div className="text-xs">
                <a
                  href={`${config.bitbucket.base_url}/${config.bitbucket.workspace}/${pr.repo}/pull-requests/${pr.prId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-red-700 hover:underline"
                >
                  PR #{pr.prId}
                </a>
                <span className="text-red-600 ml-1">waiting {Math.round(pr.ageHours / 24)} days for review</span>
                <span className="text-red-400 ml-1">({pr.repo})</span>
                {pr.title && <p className="text-red-500 mt-0.5">{pr.title}</p>}
              </div>
            </div>
          ))}
          {data.blockers.idleTickets.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <WarningIcon className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
              <div className="text-xs">
                <a
                  href={`${config.jiraBaseUrl}/browse/${t.jiraKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-orange-700 hover:underline"
                >
                  {t.jiraKey}
                </a>
                <span className="text-orange-600 ml-1">no activity for {t.idleDays} days</span>
                {t.summary && <p className="text-orange-500 mt-0.5">{t.summary}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Two columns: Yesterday + Today/Focus */}
      <div className="grid grid-cols-2 divide-x divide-gray-100">
        {/* Yesterday */}
        <div className="p-4">
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Yesterday
          </h4>
          {!hasYesterday ? (
            <p className="text-xs text-gray-300 italic">No activity</p>
          ) : (
            <div className="space-y-2.5">
              {/* Ticket transitions — most important */}
              {data.yesterday.ticketsMoved.map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <ArrowRightIcon className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <a
                      href={`${config.jiraBaseUrl}/browse/${t.jiraKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {t.jiraKey}
                    </a>
                    <span className="text-gray-400 mx-1">moved</span>
                    <StatusBadge status={t.fromStatus} />
                    <span className="text-gray-300 mx-1">&rarr;</span>
                    <StatusBadge status={t.toStatus} />
                  </div>
                </div>
              ))}
              {/* PRs merged */}
              {data.yesterday.prsMerged.map((pr, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <svg className="w-3 h-3 text-purple-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <a
                      href={`${config.bitbucket.base_url}/${config.bitbucket.workspace}/${pr.repo}/pull-requests/${pr.prId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-purple-600 hover:underline"
                    >
                      PR #{pr.prId}
                    </a>
                    <span className="text-purple-500 ml-1">merged</span>
                    <span className="text-gray-400 ml-1">({pr.repo})</span>
                  </div>
                </div>
              ))}
              {/* Summaries — full text */}
              {data.yesterday.summaries.map((s, i) => (
                <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-xs">
                  <a
                    href={`${config.jiraBaseUrl}/browse/${s.jiraKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {s.jiraKey}
                  </a>
                  <p className="text-gray-600 mt-1 leading-relaxed">{s.summaryText}</p>
                </div>
              ))}
              {/* Fallback: commit count if no summaries */}
              {data.yesterday.commits.length > 0 && data.yesterday.summaries.length === 0 && (
                <p className="text-xs text-gray-500">
                  {data.yesterday.commits.length} commit{data.yesterday.commits.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Today / Current Focus */}
        <div className="p-4">
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Current Focus
          </h4>
          {!hasToday ? (
            <p className="text-xs text-gray-300 italic">Nothing in progress</p>
          ) : (
            <div className="space-y-2.5">
              {/* Active tickets — primary focus */}
              {data.today.activeTickets.map((t, i) => (
                <div key={i} className="bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <a
                      href={`${config.jiraBaseUrl}/browse/${t.jiraKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      {t.jiraKey}
                    </a>
                    <StatusBadge status={t.status} />
                  </div>
                  {t.summary && <p className="text-xs text-gray-600 mt-1">{t.summary}</p>}
                </div>
              ))}
              {/* Active branches not tied to tickets */}
              {data.today.activeBranches.filter((b) => !data.today.activeTickets.some((t) => t.jiraKey === b.jiraKey)).map((b, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs px-1">
                  <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 15.75L3 12m0 0l3.75-3.75M3 12h18" />
                  </svg>
                  <span className="text-gray-600 font-mono text-[11px]">{b.name.length > 35 ? b.name.slice(0, 32) + "..." : b.name}</span>
                  <PRStateBadge state={b.prState} />
                </div>
              ))}
              {/* Open PR count */}
              {data.today.openPRs.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 px-1 pt-1 border-t border-gray-100">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  {data.today.openPRs.length} open PR{data.today.openPRs.length !== 1 ? "s" : ""} awaiting review
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main View ────────────────────────────────────────────────────────────

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

  // Sort: blockers first, then active, then idle
  const sorted = [...data].sort((a, b) => {
    const aScore = (a.blockers.stalePRs.length + a.blockers.idleTickets.length) * 100
      + a.yesterday.commits.length + a.today.activeTickets.length * 10;
    const bScore = (b.blockers.stalePRs.length + b.blockers.idleTickets.length) * 100
      + b.yesterday.commits.length + b.today.activeTickets.length * 10;
    return bScore - aScore;
  });

  const totalBlockers = data.reduce((s, d) => s + d.blockers.stalePRs.length + d.blockers.idleTickets.length, 0);
  const activeCount = data.filter((d) => d.yesterday.commits.length > 0 || d.today.activeTickets.length > 0).length;
  const isToday = date === getToday();

  return (
    <div className="space-y-4">
      {/* Header with date nav */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Daily Standup</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500">{activeCount} active / {data.length} members</span>
            {totalBlockers > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                <WarningIcon className="w-3 h-3" />
                {totalBlockers} blocker{totalBlockers !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevDay} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center min-w-[200px]">
            <span className="text-sm font-medium text-gray-700">{formatDate(date)}</span>
            {isToday && <span className="ml-2 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">Today</span>}
          </div>
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
            <MemberStandupCard key={d.member.name} data={d} config={config} />
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
