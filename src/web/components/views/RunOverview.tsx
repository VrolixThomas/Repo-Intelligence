import { useState, useEffect } from "react";
import { StatsCard } from "../StatsCard";
import { CommitLink, JiraLink } from "../ExternalLink";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { FollowUpButton } from "../FollowUpButton";
import { fetchStats, fetchRuns, fetchRunDetail } from "../../api";
import type { AppConfig, DashboardStats, Run, RunDetail } from "../../types";

interface Props {
  config: AppConfig;
}

export function RunOverview({ config }: Props) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [allRuns, setRuns] = useState<Run[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([fetchStats(), fetchRuns()]).then(([s, r]) => {
      setStats(s);
      setRuns(r);
    }).catch((err: any) => setError(err?.message ?? "Failed to load data")).finally(() => setLoading(false));
  }, []);

  const toggleRun = async (runId: number) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setRunDetail(null);
      return;
    }
    setExpandedRunId(runId);
    setRunDetail(null);
    try {
      const detail = await fetchRunDetail(runId);
      setRunDetail(detail);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load run detail");
    }
  };

  // Build email->name map from config
  const emailToName = new Map<string, string>();
  for (const member of config.team) {
    for (const email of member.emails) {
      emailToName.set(email.toLowerCase(), member.name);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Skeleton stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
              <div className="h-7 bg-gray-200 rounded w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Overview of scan runs and team activity</p>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard label="Total Runs" value={stats.totalRuns} color="blue" />
          <StatsCard label="Total Commits" value={stats.totalCommits} color="green" />
          <StatsCard label="Active Members" value={stats.activeMembers} color="purple" />
          <StatsCard label="Tracked Tickets" value={stats.activeTickets} color="amber" />
        </div>
      )}

      {/* Runs table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-3 border-b bg-gray-50/50 rounded-t-xl">
          <h3 className="text-sm font-semibold text-gray-700">Completed Runs</h3>
        </div>
        {allRuns.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5z" />
            </svg>
            <p className="text-gray-500 text-sm">No completed runs yet.</p>
            <p className="text-gray-400 text-xs mt-1">Run <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">bun run scan.ts</code> to create one.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-600">
                <th className="px-5 py-2.5 font-medium">Run</th>
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-5 py-2.5 font-medium">Scan Period</th>
                <th className="px-5 py-2.5 font-medium">Repos</th>
                <th className="px-5 py-2.5 font-medium">Commits</th>
                <th className="px-5 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {allRuns.map((run) => (
                <>
                  <tr
                    key={run.id}
                    onClick={() => toggleRun(run.id)}
                    className={`border-b cursor-pointer transition-colors ${
                      expandedRunId === run.id ? "bg-blue-50" : "hover:bg-gray-50 even:bg-gray-50/50"
                    }`}
                  >
                    <td className="px-5 py-2.5 font-mono text-gray-700">#{run.id}</td>
                    <td className="px-5 py-2.5">{formatDate(run.startedAt, config.timezone)}</td>
                    <td className="px-5 py-2.5 text-xs text-gray-500">
                      {formatScanPeriod(run.scanSince, run.scanUntil)}
                    </td>
                    <td className="px-5 py-2.5">{run.reposScanned ?? 0}</td>
                    <td className="px-5 py-2.5">{run.commitsFound ?? 0}</td>
                    <td className="px-5 py-2.5 text-gray-400">
                      {expandedRunId === run.id ? "\u25B2" : "\u25BC"}
                    </td>
                  </tr>
                  {expandedRunId === run.id && (
                    <tr key={`${run.id}-detail`}>
                      <td colSpan={6} className="bg-gray-50 px-5 py-4">
                        {!runDetail ? (
                          <div className="animate-pulse space-y-3">
                            <div className="h-4 bg-gray-200 rounded w-1/4" />
                            <div className="h-20 bg-gray-200 rounded" />
                          </div>
                        ) : (
                          <RunDetailPanel detail={runDetail} config={config} emailToName={emailToName} />
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RunDetailPanel({
  detail,
  config,
  emailToName,
}: {
  detail: RunDetail;
  config: AppConfig;
  emailToName: Map<string, string>;
}) {
  const { ticketSummaries: tSummaries, commits, tickets } = detail;

  return (
    <div className="space-y-4">
      {/* Ticket Summaries */}
      {tSummaries.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-700 mb-2">Ticket Summaries</h4>
          <div className="space-y-3">
            {tSummaries.map((s) => {
              const label = s.jiraKey.startsWith("branch:") ? s.jiraKey.replace("branch:", "Branch: ") : s.jiraKey;
              return (
                <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                        {label.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-800">{label}</span>
                        {s.repo && <span className="ml-2 text-xs text-gray-400">{s.repo}</span>}
                      </div>
                    </div>
                    <FollowUpButton sessionId={s.sessionId} ticketKey={s.jiraKey.startsWith("branch:") ? undefined : s.jiraKey} runId={detail.run.id} />
                  </div>
                  <MarkdownRenderer content={s.summaryText} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Commits */}
      {commits.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-700 mb-2">Commits ({commits.length})</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="px-2 py-1.5">SHA</th>
                  <th className="px-2 py-1.5">Message</th>
                  <th className="px-2 py-1.5">Author</th>
                  <th className="px-2 py-1.5">+/-</th>
                </tr>
              </thead>
              <tbody>
                {commits.map((c) => (
                  <tr key={c.sha} className="border-b border-gray-100 even:bg-gray-50/50">
                    <td className="px-2 py-1.5">
                      <CommitLink config={config} repo={c.repo} sha={c.sha}>
                        {c.shortSha}
                      </CommitLink>
                    </td>
                    <td className="px-2 py-1.5 max-w-md truncate">{c.message.split("\n")[0]}</td>
                    <td className="px-2 py-1.5 text-gray-500">
                      {emailToName.get(c.authorEmail.toLowerCase()) ?? c.authorName}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="text-green-600">+{c.insertions}</span>
                      <span className="text-red-600 ml-1">-{c.deletions}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tickets */}
      {tickets.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-700 mb-2">Referenced Tickets</h4>
          <div className="flex flex-wrap gap-2">
            {tickets.map((t) => (
              <JiraLink key={t.jiraKey} config={config} jiraKey={t.jiraKey}>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                  {t.jiraKey}
                  {t.status && <span className="text-gray-400">({t.status})</span>}
                </span>
              </JiraLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string, timezone: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { timeZone: timezone }) +
    " " +
    d.toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
}

function formatScanPeriod(since: string | null, until: string | null): string {
  if (!since && !until) return "\u2014";
  const fmtShort = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const s = since ? fmtShort(since) : "?";
  const u = until ? fmtShort(until) : "now";
  return `${s} \u2192 ${u}`;
}
