import { useState, useEffect } from "react";
import { fetchTicketLifecycle, fetchTicketSummaries } from "../../api";
import { JiraLink } from "../ExternalLink";
import type { AppConfig, TicketLifecycleResponse, TicketLifecycleMetric, TicketSummary } from "../../types";

interface Props {
  config: AppConfig;
  sprintId?: number | null;
}

const sortOptions = [
  { value: "idle", label: "Most Idle" },
  { value: "duration", label: "Longest Duration" },
  { value: "commits", label: "Most Commits" },
  { value: "recent", label: "Most Recent" },
];

const thresholdOptions = [3, 5, 7, 14, 30];

const statusColors: Record<string, string> = {
  "To Do": "bg-gray-200 text-gray-700",
  "In Progress": "bg-blue-200 text-blue-700",
  "In Review": "bg-purple-200 text-purple-700",
  "Done": "bg-green-200 text-green-700",
};

function idleColor(days: number): string {
  if (days <= 2) return "text-green-600";
  if (days <= 7) return "text-yellow-600";
  if (days <= 14) return "text-orange-600";
  return "text-red-600";
}

function idleBg(days: number): string {
  if (days <= 2) return "bg-green-50";
  if (days <= 7) return "bg-yellow-50";
  if (days <= 14) return "bg-orange-50";
  return "bg-red-50";
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}

function formatDuration(m: TicketLifecycleMetric): string {
  if (m.durationDays >= 1) return `${m.durationDays}d`;
  if (m.durationHours > 0) return `${m.durationHours}h`;
  return "0h";
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function TicketDetailPanel({
  metric,
  config,
  onClose,
}: {
  metric: TicketLifecycleMetric;
  config: AppConfig;
  onClose: () => void;
}) {
  const [summaries, setSummaries] = useState<TicketSummary[]>([]);
  useEffect(() => {
    fetchTicketSummaries({ jiraKey: metric.jiraKey }).then(setSummaries).catch(() => {});
  }, [metric.jiraKey]);

  const emailToName = new Map<string, string>();
  for (const member of config.team) {
    for (const email of member.emails) {
      emailToName.set(email.toLowerCase(), member.name);
    }
  }
  const contributors = [...new Set(metric.authorEmails.map((e) => emailToName.get(e.toLowerCase()) ?? e))];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <JiraLink config={config} jiraKey={metric.jiraKey} className="text-blue-600 hover:text-blue-800 hover:underline font-semibold text-lg">
            {metric.jiraKey}
          </JiraLink>
          {metric.ticket?.status && (
            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[metric.ticket.status] ?? "bg-gray-200 text-gray-700"}`}>
              {metric.ticket.status}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {metric.ticket?.summary && (
        <p className="text-sm text-gray-700 mb-4">{metric.ticket.summary}</p>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-gray-800">{formatDuration(metric)}</p>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Duration</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${idleBg(metric.idleDays)}`}>
          <p className={`text-2xl font-bold ${idleColor(metric.idleDays)}`}>{metric.idleDays}</p>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Days Idle</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-gray-800">{metric.commitCount}</p>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Commits</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-gray-800">{metric.branchCount}</p>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Branches</p>
        </div>
      </div>

      <div className="mb-4">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Timeline</h4>
        <div className="text-sm text-gray-700 space-y-1">
          <p>First commit: <span className="font-medium">{new Date(metric.firstCommitDate).toLocaleDateString()}</span></p>
          <p>Last commit: <span className="font-medium">{new Date(metric.lastCommitDate).toLocaleDateString()}</span> ({relativeTime(metric.lastCommitDate)})</p>
        </div>
      </div>

      <div className="mb-4">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contributors</h4>
        <div className="flex flex-wrap gap-1.5">
          {contributors.map((name) => {
            const initials = name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
            return (
              <div key={name} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
                <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-bold">
                  {initials}
                </div>
                <span className="text-xs font-medium text-gray-700">{name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {metric.repos.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Repositories</h4>
          <div className="flex flex-wrap gap-1.5">
            {metric.repos.map((repo) => (
              <span key={repo} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 font-mono">{repo}</span>
            ))}
          </div>
        </div>
      )}

      {summaries.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">AI Summaries</h4>
          <div className="space-y-3">
            {summaries.slice(0, 5).map((s) => (
              <div key={s.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-xs text-gray-400 mb-1">{new Date(s.createdAt).toLocaleDateString()}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.summaryText.slice(0, 500)}{s.summaryText.length > 500 ? "..." : ""}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TicketLifecycleView({ config, sprintId }: Props) {
  const [data, setData] = useState<TicketLifecycleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState("idle");
  const [staleThreshold, setStaleThreshold] = useState(7);
  const [staleOnly, setStaleOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchTicketLifecycle({
      sprintId: sprintId ?? undefined,
      sort,
      staleThreshold,
    }).then((d) => {
      setData(d);
    }).catch((err: any) => setError(err?.message ?? "Failed to load data")).finally(() => setLoading(false));
  }, [sprintId, sort, staleThreshold]);

  // Escape key to close drawer
  useEffect(() => {
    if (!selectedKey) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedKey(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedKey]);

  if (loading || !data) {
    return <div className="text-gray-500 text-center py-12">Loading lifecycle data...</div>;
  }

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
  );

  const displayMetrics = staleOnly ? data.metrics.filter((m) => m.isStale) : data.metrics;
  const selectedMetric = selectedKey ? data.metrics.find((m) => m.jiraKey === selectedKey) : null;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">Ticket Lifecycle</h2>
        <p className="text-sm text-gray-500 mt-1">Track how long tickets have been worked on and identify stale items</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Tracked" value={data.summary.totalTracked} />
        <StatCard label="Stale" value={data.summary.staleCount} sub={`>${staleThreshold}d idle`} />
        <StatCard label="Avg Duration" value={`${data.summary.avgDuration}d`} />
        <StatCard label="Avg Idle" value={`${data.summary.avgIdle}d`} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Sort</label>
          <select
            value={sort}
            onChange={(e: any) => setSort(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Stale after</label>
          <select
            value={staleThreshold}
            onChange={(e: any) => setStaleThreshold(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white"
          >
            {thresholdOptions.map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={staleOnly}
            onChange={(e: any) => setStaleOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          Stale only
        </label>
        <span className="text-xs text-gray-400 ml-auto">{displayMetrics.length} ticket{displayMetrics.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ticket</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Summary</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assignee</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Activity</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Idle</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Commits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayMetrics.map((m) => (
              <tr
                key={m.jiraKey}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedKey(m.jiraKey)}
              >
                <td className="px-4 py-2.5">
                  <JiraLink config={config} jiraKey={m.jiraKey} className="text-blue-600 hover:text-blue-800 hover:underline font-semibold text-xs">
                    {m.jiraKey}
                  </JiraLink>
                </td>
                <td className="px-4 py-2.5 text-gray-700 max-w-[300px] truncate">{m.ticket?.summary ?? "-"}</td>
                <td className="px-4 py-2.5">
                  {m.ticket?.status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[m.ticket.status] ?? "bg-gray-200 text-gray-700"}`}>
                      {m.ticket.status}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-600">{m.ticket?.assignee ?? "-"}</td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700">{formatDuration(m)}</td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-500">{relativeTime(m.lastCommitDate)}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${idleBg(m.idleDays)} ${idleColor(m.idleDays)}`}>
                    {m.idleDays}d
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-600">{m.commitCount}</td>
              </tr>
            ))}
            {displayMetrics.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  {staleOnly ? "No stale tickets found" : "No lifecycle data available"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      {selectedKey && selectedMetric && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedKey(null)} />
          <div className="fixed top-0 right-0 h-full w-[480px] max-w-[90vw] z-50 bg-white shadow-2xl overflow-y-auto animate-slide-in">
            <TicketDetailPanel metric={selectedMetric} config={config} onClose={() => setSelectedKey(null)} />
          </div>
        </>
      )}

      <style>{`
        @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slide-in { animation: slide-in 0.2s ease-out; }
      `}</style>
    </div>
  );
}
