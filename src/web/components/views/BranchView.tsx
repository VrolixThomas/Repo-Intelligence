import { useState, useEffect } from "react";
import { CommitLink, BranchLink, JiraLink } from "../ExternalLink";
import { PRBadge } from "../PRBadge";
import { fetchBranches, fetchFilters } from "../../api";
import type { AppConfig, BranchWithCommits } from "../../types";

interface Props {
  config: AppConfig;
  sprintId?: number | null;
}

export function BranchView({ config, sprintId }: Props) {
  const [branches, setBranches] = useState<BranchWithCommits[]>([]);
  const [repos, setRepos] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [filterRepo, setFilterRepo] = useState("");
  const [filterAuthor, setFilterAuthor] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedBranches, setExpandedBranches] = useState<Set<number>>(new Set());

  const emailToName = new Map<string, string>();
  for (const member of config.team) {
    for (const email of member.emails) {
      emailToName.set(email.toLowerCase(), member.name);
    }
  }

  useEffect(() => {
    fetchFilters().then((f) => {
      setRepos(f.repos);
      setAuthors(f.authors);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchBranches({
      repo: filterRepo || undefined,
      author: filterAuthor || undefined,
    }).then((data) => {
      setBranches(data);
      setLoading(false);
    });
  }, [filterRepo, filterAuthor]);

  const toggleExpand = (id: number) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusColor = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "to do": return "bg-gray-100 text-gray-700";
      case "in progress": return "bg-blue-100 text-blue-700";
      case "in review": return "bg-purple-100 text-purple-700";
      case "done": case "closed": return "bg-green-100 text-green-700";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  // Parse reviewers JSON safely
  const parseReviewers = (json: string | null): string[] => {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Branches</h2>
        <p className="text-sm text-gray-500 mt-1">Active branches with commits, tickets, and PR status</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex gap-3">
          <select
            value={filterRepo}
            onChange={(e: any) => setFilterRepo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All repos</option>
            {repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={filterAuthor}
            onChange={(e: any) => setFilterAuthor(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All authors</option>
            {authors.map((a) => (
              <option key={a} value={a}>{emailToName.get(a.toLowerCase()) ?? a}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500 self-center ml-auto">
            {branches.length} branch{branches.length !== 1 ? "es" : ""}
          </span>
        </div>
      </div>

      {/* Branch cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-2/3 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <p className="text-gray-500 text-sm">No active branches found. Run a scan to populate branch data.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {branches.map((b) => {
            const isExpanded = expandedBranches.has(b.branch.id);
            const visibleCommits = isExpanded ? b.branchCommits : b.branchCommits.slice(0, 5);
            const hasMore = b.branchCommits.length > 5;
            const totalFiles = b.branchCommits.reduce((s, c) => s + c.filesChanged, 0);
            const totalAdd = b.branchCommits.reduce((s, c) => s + c.insertions, 0);
            const totalDel = b.branchCommits.reduce((s, c) => s + c.deletions, 0);
            const reviewers = parseReviewers(b.branch.prReviewers);

            return (
              <div key={b.branch.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Branch header */}
                <div className="px-5 py-4 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <BranchLink config={config} repo={b.branch.repo} branch={b.branch.name}>
                          <span className="text-sm font-semibold text-gray-900 hover:text-blue-600 break-all">
                            {b.branch.name}
                          </span>
                        </BranchLink>
                        <PRBadge
                          state={b.branch.prState as any}
                          url={b.branch.prUrl}
                          compact
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>{b.branch.repo}</span>
                        <span className="text-gray-300">|</span>
                        <span>{emailToName.get(b.branch.authorEmail.toLowerCase()) ?? b.branch.authorEmail}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      <span className="text-gray-500">{totalFiles} files</span>
                      <span className="text-green-600">+{totalAdd}</span>
                      <span className="text-red-600">-{totalDel}</span>
                    </div>
                  </div>
                </div>

                {/* PR details */}
                {b.branch.prId && (
                  <div className="px-5 py-3 bg-blue-50/30 border-b border-gray-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={b.branch.prUrl ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-800 hover:text-blue-600 font-medium"
                      >
                        PR #{b.branch.prId}: {b.branch.prTitle}
                      </a>
                      {b.branch.prTargetBranch && (
                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          &rarr; {b.branch.prTargetBranch}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      {reviewers.length > 0 && (
                        <span>Reviewers: {reviewers.join(", ")}</span>
                      )}
                      {b.branch.prApprovals != null && b.branch.prApprovals > 0 && (
                        <span className="text-green-600">{b.branch.prApprovals} approval{b.branch.prApprovals !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Ticket info */}
                {b.ticket && (
                  <div className="px-5 py-3 bg-amber-50/50 border-b border-gray-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <JiraLink config={config} jiraKey={b.ticket.jiraKey} className="text-blue-600 hover:underline text-xs font-semibold">
                        {b.ticket.jiraKey}
                      </JiraLink>
                      {b.ticket.status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor(b.ticket.status)}`}>
                          {b.ticket.status}
                        </span>
                      )}
                      <span className="text-sm text-gray-700 truncate">{b.ticket.summary}</span>
                    </div>
                    {b.ticket.assignee && (
                      <p className="text-xs text-gray-500 mt-1">Assignee: {b.ticket.assignee}</p>
                    )}
                  </div>
                )}

                {/* Commits */}
                {b.branchCommits.length > 0 && (
                  <div className="px-5 py-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      Commits ({b.branchCommits.length})
                    </p>
                    <div className="space-y-1.5">
                      {visibleCommits.map((c) => (
                        <div key={c.sha} className="flex items-center gap-2 text-xs">
                          <CommitLink config={config} repo={c.repo} sha={c.sha}>
                            <span className="font-mono text-blue-600">{c.shortSha}</span>
                          </CommitLink>
                          <span className="text-gray-700 truncate">{c.message.split("\n")[0]}</span>
                          <span className="text-gray-400 shrink-0 ml-auto whitespace-nowrap">
                            {c.filesChanged}f
                            <span className="text-green-600 ml-1">+{c.insertions}</span>
                            <span className="text-red-600 ml-0.5">-{c.deletions}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    {hasMore && (
                      <button
                        onClick={() => toggleExpand(b.branch.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 mt-2"
                      >
                        {isExpanded
                          ? "Show less"
                          : `Show ${b.branchCommits.length - 5} more commits`}
                      </button>
                    )}
                  </div>
                )}

                {b.branchCommits.length === 0 && (
                  <div className="px-5 py-3">
                    <p className="text-xs text-gray-400">No commits tracked for this branch yet.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
