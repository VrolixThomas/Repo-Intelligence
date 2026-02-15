import { useState, useEffect } from "react";
import { PRBadge } from "../PRBadge";
import { JiraLink } from "../ExternalLink";
import { fetchPullRequests, fetchPullRequestDetail, fetchPRStats, fetchPRReviewers, fetchPRFilters } from "../../api";
import type { AppConfig, PullRequest, PRDetail, PRDashboardStats, ReviewerStat, PRFilters } from "../../types";

interface Props {
  config: AppConfig;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return "-";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatDurationHours(hours: number): string {
  if (hours === 0) return "-";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${Math.round(hours % 24)}h`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function parseReviewers(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

export function PullRequestView({ config }: Props) {
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<PRDashboardStats | null>(null);
  const [reviewers, setReviewers] = useState<ReviewerStat[]>([]);
  const [filters, setFilters] = useState<PRFilters | null>(null);
  const [filterRepo, setFilterRepo] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterAuthor, setFilterAuthor] = useState("");
  const [tab, setTab] = useState<"prs" | "reviewers">("prs");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPR, setSelectedPR] = useState<PRDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    fetchPRFilters().then(setFilters).catch(() => {});
  }, []);

  useEffect(() => {
    fetchPRStats(filterRepo || undefined).then(setStats).catch(() => {});
    fetchPRReviewers(filterRepo || undefined).then(setReviewers).catch(() => {});
  }, [filterRepo]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPullRequests({
      repo: filterRepo || undefined,
      state: filterState || undefined,
      author: filterAuthor || undefined,
      page,
      pageSize,
    }).then((data) => {
      setPrs(data.pullRequests);
      setTotal(data.total);
    }).catch((err: any) => setError(err?.message ?? "Failed to load data")).finally(() => setLoading(false));
  }, [filterRepo, filterState, filterAuthor, page]);

  const openDrawer = (prId: number) => {
    setDrawerLoading(true);
    setDrawerOpen(true);
    fetchPullRequestDetail(prId).then((detail) => {
      setSelectedPR(detail);
      setDrawerLoading(false);
    }).catch(() => setDrawerLoading(false));
  };

  const totalPages = Math.ceil(total / pageSize);

  const activityColor: Record<string, { bg: string; border: string; icon: string }> = {
    approval: {
      bg: "bg-green-100",
      border: "border-green-400",
      icon: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z",
    },
    request_changes: {
      bg: "bg-red-100",
      border: "border-red-400",
      icon: "M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z",
    },
    comment: {
      bg: "bg-blue-100",
      border: "border-blue-400",
      icon: "M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z",
    },
    update: {
      bg: "bg-gray-100",
      border: "border-gray-400",
      icon: "M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z",
    },
  };

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
  );

  return (
    <div className="relative">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Pull Requests</h2>
        <p className="text-sm text-gray-500 mt-1">PR tracking, review metrics, and activity timelines</p>
      </div>

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Open PRs</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{stats.totalOpen}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Time to Merge</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatDurationHours(stats.avgTimeToMergeHours)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Time to Review</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatDurationHours(stats.avgTimeToFirstReviewHours)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Review Rounds</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.avgReviewRounds || "-"}</p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex gap-3 items-center">
          <select
            value={filterRepo}
            onChange={(e: any) => { setFilterRepo(e.target.value); setPage(1); }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All repos</option>
            {filters?.repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={filterState}
            onChange={(e: any) => { setFilterState(e.target.value); setPage(1); }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All states</option>
            {filters?.states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterAuthor}
            onChange={(e: any) => { setFilterAuthor(e.target.value); setPage(1); }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All authors</option>
            {filters?.authors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Tabs */}
          <div className="ml-auto flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setTab("prs")}
              className={`text-sm px-3 py-1 rounded-md transition-colors ${tab === "prs" ? "bg-white shadow text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"}`}
            >
              All PRs
            </button>
            <button
              onClick={() => setTab("reviewers")}
              className={`text-sm px-3 py-1 rounded-md transition-colors ${tab === "reviewers" ? "bg-white shadow text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"}`}
            >
              Reviewer Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Tab: All PRs */}
      {tab === "prs" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : prs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No pull requests found</div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Title</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-28">Author</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-20">State</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-44">Branch</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-16">TTFR</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-16">TTM</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-16">Rounds</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-14">
                      <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                      </svg>
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-20">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {prs.map((pr) => (
                    <tr
                      key={pr.id}
                      onClick={() => openDrawer(pr.id)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900 truncate max-w-md">{pr.title}</div>
                        <div className="text-xs text-gray-400">{pr.repo} #{pr.prId}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 truncate">{pr.authorName ?? "-"}</td>
                      <td className="px-4 py-2.5">
                        <PRBadge state={pr.state as any} compact />
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-gray-500 truncate block max-w-[160px]">
                          {pr.sourceBranch} <span className="text-gray-300">&rarr;</span> {pr.targetBranch}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600 font-mono text-xs">{formatDuration(pr.timeToFirstReviewMins)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 font-mono text-xs">{formatDuration(pr.timeToMergeMins)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 font-mono text-xs">{pr.reviewRounds ?? 0}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 font-mono text-xs">{pr.commentCount ?? 0}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-400">{timeAgo(pr.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                  <span className="text-xs text-gray-500">{total} pull requests</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-2 py-1 text-xs border rounded disabled:opacity-30"
                    >
                      Prev
                    </button>
                    <span className="px-2 py-1 text-xs text-gray-600">{page} / {totalPages}</span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-2 py-1 text-xs border rounded disabled:opacity-30"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Reviewer Analytics */}
      {tab === "reviewers" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {reviewers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No reviewer data available</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Reviewer</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-28">PRs Reviewed</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-28">Approvals</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-32">Changes Requested</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-32">Avg Response</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600">Activity</th>
                </tr>
              </thead>
              <tbody>
                {reviewers.map((r) => {
                  const maxPRs = Math.max(...reviewers.map((x) => x.prsReviewed), 1);
                  const barWidth = Math.round((r.prsReviewed / maxPRs) * 100);
                  return (
                    <tr key={r.reviewerName} className="border-b border-gray-100">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.reviewerName}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{r.prsReviewed}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-green-600 font-medium">{r.totalApprovals}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={r.totalChangesRequested > 0 ? "text-red-600 font-medium" : "text-gray-400"}>
                          {r.totalChangesRequested}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-600">
                        {formatDuration(r.avgResponseTimeMins)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Detail Drawer */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => { setDrawerOpen(false); setSelectedPR(null); }}
          />

          {/* Drawer */}
          <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-50 overflow-y-auto border-l border-gray-200">
            {drawerLoading || !selectedPR ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : (
              <div>
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 mr-3">
                      <h3 className="font-bold text-gray-900 text-lg leading-tight">{selectedPR.pr.title}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <PRBadge state={selectedPR.pr.state as any} compact />
                        <span className="text-xs text-gray-500">{selectedPR.pr.repo} #{selectedPR.pr.prId}</span>
                        <span className="text-xs text-gray-400">by {selectedPR.pr.authorName ?? "Unknown"}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => { setDrawerOpen(false); setSelectedPR(null); }}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Link */}
                  <a
                    href={selectedPR.pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline mt-1 inline-block"
                  >
                    View on Bitbucket
                  </a>
                </div>

                {/* Metric Cards */}
                <div className="grid grid-cols-5 gap-2 p-4">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">TTFR</p>
                    <p className="text-sm font-bold text-gray-900">{formatDuration(selectedPR.pr.timeToFirstReviewMins)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">TTM</p>
                    <p className="text-sm font-bold text-gray-900">{formatDuration(selectedPR.pr.timeToMergeMins)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Rounds</p>
                    <p className="text-sm font-bold text-gray-900">{selectedPR.pr.reviewRounds ?? 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Comments</p>
                    <p className="text-sm font-bold text-gray-900">{selectedPR.pr.commentCount ?? 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Approvals</p>
                    <p className="text-sm font-bold text-green-600">{selectedPR.pr.approvals ?? 0}</p>
                  </div>
                </div>

                {/* Branch Info */}
                <div className="px-4 pb-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{selectedPR.pr.sourceBranch}</span>
                    <span>&rarr;</span>
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{selectedPR.pr.targetBranch}</span>
                  </div>
                  {selectedPR.ticket && (
                    <div className="mt-2">
                      <JiraLink config={config} jiraKey={selectedPR.ticket.jiraKey}>
                        <span className="text-xs">
                          {selectedPR.ticket.jiraKey}: {selectedPR.ticket.summary}
                        </span>
                      </JiraLink>
                    </div>
                  )}
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span>Created {new Date(selectedPR.pr.createdAt).toLocaleDateString()}</span>
                    <span>Updated {timeAgo(selectedPR.pr.updatedAt)}</span>
                  </div>
                  {parseReviewers(selectedPR.pr.reviewers).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {parseReviewers(selectedPR.pr.reviewers).map((r) => (
                        <span key={r} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{r}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Activity Timeline */}
                <div className="border-t border-gray-200 p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Activity Timeline</h4>
                  {selectedPR.activities.length === 0 ? (
                    <p className="text-xs text-gray-400">No activity recorded</p>
                  ) : (
                    <div className="relative">
                      {/* Vertical line */}
                      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200" />

                      <div className="space-y-3">
                        {selectedPR.activities.map((a) => {
                          const ac = activityColor[a.activityType] ?? activityColor.update!;
                          const labels: Record<string, string> = {
                            approval: "approved",
                            comment: "commented",
                            request_changes: "requested changes",
                            update: "pushed update",
                          };
                          return (
                            <div key={a.id} className="flex gap-3 relative">
                              <div className={`w-6 h-6 rounded-full ${ac.bg} border-2 ${ac.border} flex items-center justify-center shrink-0 z-10`}>
                                <svg className="w-3 h-3 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d={ac.icon} clipRule="evenodd" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1">
                                  <span className="text-xs font-medium text-gray-900">{a.actorName ?? "Unknown"}</span>
                                  <span className="text-xs text-gray-500">{labels[a.activityType] ?? a.activityType}</span>
                                  <span className="text-[10px] text-gray-400 ml-auto shrink-0">{timeAgo(a.timestamp)}</span>
                                </div>
                                {a.commentText && (
                                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{a.commentText}</p>
                                )}
                                {a.commitHash && (
                                  <span className="text-[10px] font-mono text-gray-400 mt-0.5 inline-block">
                                    {a.commitHash.slice(0, 7)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Commits */}
                {selectedPR.commits.length > 0 && (
                  <div className="border-t border-gray-200 p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">
                      Commits ({selectedPR.commits.length})
                    </h4>
                    <div className="space-y-1.5">
                      {selectedPR.commits.slice(0, 20).map((c) => (
                        <div key={c.sha} className="flex items-start gap-2">
                          <span className="text-[10px] font-mono text-gray-400 shrink-0 mt-0.5">{c.shortSha}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 truncate">{c.message.split("\n")[0]}</p>
                            <p className="text-[10px] text-gray-400">{c.authorName} &middot; +{c.insertions}/-{c.deletions}</p>
                          </div>
                        </div>
                      ))}
                      {selectedPR.commits.length > 20 && (
                        <p className="text-xs text-gray-400">... and {selectedPR.commits.length - 20} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
