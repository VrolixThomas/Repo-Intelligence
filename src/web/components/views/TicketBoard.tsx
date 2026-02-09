import { useState, useEffect } from "react";
import { JiraLink, BranchLink, CommitLink } from "../ExternalLink";
import { PRBadge } from "../PRBadge";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { FollowUpButton } from "../FollowUpButton";
import { fetchTicketsByStatus, fetchBranches, fetchTicketSummaries } from "../../api";
import type { AppConfig, Ticket, TicketsByStatus, TicketLifecycleSummary, BranchWithCommits, TicketSummary } from "../../types";

interface Props {
  config: AppConfig;
  sprintId?: number | null;
}

const STATUS_ORDER = ["To Do", "In Progress", "In Review", "Done"];

const priorityColors: Record<string, string> = {
  Highest: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-green-100 text-green-700",
  Lowest: "bg-gray-100 text-gray-600",
};

const statusColors: Record<string, string> = {
  "To Do": "bg-gray-200",
  "In Progress": "bg-blue-200",
  "In Review": "bg-purple-200",
  "Done": "bg-green-200",
};

function idleDotColor(days: number): string {
  if (days <= 2) return "bg-green-500";
  if (days <= 7) return "bg-yellow-500";
  if (days <= 14) return "bg-orange-500";
  return "bg-red-500";
}

function formatDuration(lc: TicketLifecycleSummary): string {
  if (lc.durationDays >= 1) return `${lc.durationDays}d`;
  if (lc.durationHours > 0) return `${lc.durationHours}h`;
  return "0h";
}

function formatIdleShort(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export function TicketBoard({ config, sprintId }: Props) {
  const [data, setData] = useState<TicketsByStatus | null>(null);
  const [branches, setBranches] = useState<BranchWithCommits[]>([]);
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedKey(null);
    Promise.all([
      fetchTicketsByStatus(sprintId ?? undefined),
      fetchBranches(),
    ]).then(([d, b]) => {
      setData(d);
      setBranches(b);
      setLoading(false);
    });
  }, [sprintId]);

  // Close drawer on Escape
  useEffect(() => {
    if (!selectedKey) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedKey(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedKey]);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-6 bg-gray-200 rounded w-40 animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-100 rounded-xl p-3 min-h-[200px] animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-20 mb-3" />
              <div className="space-y-2">
                <div className="h-20 bg-white rounded" />
                <div className="h-20 bg-white rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Build maps
  const branchByTicket = new Map<string, BranchWithCommits>();
  const branchesByTicket = new Map<string, BranchWithCommits[]>();
  for (const b of branches) {
    if (b.branch.jiraKey) {
      if (!branchByTicket.has(b.branch.jiraKey)) {
        branchByTicket.set(b.branch.jiraKey, b);
      }
      const list = branchesByTicket.get(b.branch.jiraKey) ?? [];
      list.push(b);
      branchesByTicket.set(b.branch.jiraKey, list);
    }
  }

  const allTickets = Object.values(data.grouped).flat();
  const ticketMap = new Map(allTickets.map((t) => [t.jiraKey, t]));
  const assignees = [...new Set(allTickets.map((t) => t.assignee).filter(Boolean))] as string[];
  const priorities = [...new Set(allTickets.map((t) => t.priority).filter(Boolean))] as string[];

  const allStatuses = Object.keys(data.grouped);
  const orderedStatuses = [
    ...STATUS_ORDER.filter((s) => allStatuses.includes(s)),
    ...allStatuses.filter((s) => !STATUS_ORDER.includes(s)),
  ];

  const filterTicket = (t: Ticket) => {
    if (filterAssignee && t.assignee !== filterAssignee) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    return true;
  };

  const handleSelectTicket = (jiraKey: string) => {
    setSelectedKey(selectedKey === jiraKey ? null : jiraKey);
  };

  const selectedTicket = selectedKey ? ticketMap.get(selectedKey) ?? null : null;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Ticket Board</h2>
        <p className="text-sm text-gray-500 mt-1">
          {sprintId ? "Sprint-scoped tickets" : "Jira tickets referenced by recent commits and branches"}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex gap-3">
          <select
            value={filterAssignee}
            onChange={(e: any) => setFilterAssignee(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All assignees</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <select
            value={filterPriority}
            onChange={(e: any) => setFilterPriority(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All priorities</option>
            {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <span className="text-sm text-gray-500 self-center ml-auto">
            {allTickets.length} ticket{allTickets.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Kanban columns */}
      {orderedStatuses.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-500 text-sm">No referenced tickets found.</p>
          <p className="text-gray-400 text-xs mt-1">Run a scan with Jira ticket keys in commit messages or branch names.</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(orderedStatuses.length, 4)}, minmax(0, 1fr))` }}>
          {orderedStatuses.map((status) => {
            const tickets = (data.grouped[status] ?? []).filter(filterTicket);
            return (
              <div key={status} className="bg-gray-100 rounded-xl p-3 min-h-[200px]">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusColors[status] ?? "bg-gray-300"}`} />
                  <h3 className="text-sm font-semibold text-gray-700">{status}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white text-gray-500 font-medium ml-auto">
                    {tickets.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {tickets.map((t) => (
                    <TicketCard
                      key={t.jiraKey}
                      ticket={t}
                      config={config}
                      commitCount={data.commitCounts[t.jiraKey] ?? 0}
                      branch={branchByTicket.get(t.jiraKey)}
                      lifecycle={data.lifecycle?.[t.jiraKey]}
                      selected={selectedKey === t.jiraKey}
                      onSelect={() => handleSelectTicket(t.jiraKey)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ticket detail drawer */}
      {selectedKey && selectedTicket && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setSelectedKey(null)}
          />
          <div className="fixed top-0 right-0 h-full w-[480px] max-w-[90vw] z-50 bg-white shadow-2xl overflow-y-auto animate-slide-in">
            <TicketDetailPanel
              ticket={selectedTicket}
              config={config}
              branches={branchesByTicket.get(selectedKey) ?? []}
              commitCount={data.commitCounts[selectedKey] ?? 0}
              lifecycle={data.lifecycle?.[selectedKey]}
              onClose={() => setSelectedKey(null)}
            />
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

// ── Ticket Card (in kanban column) ──────────────────────────────────────────

function TicketCard({
  ticket,
  config,
  commitCount,
  branch,
  lifecycle,
  selected,
  onSelect,
}: {
  ticket: Ticket;
  config: AppConfig;
  commitCount: number;
  branch?: BranchWithCommits;
  lifecycle?: TicketLifecycleSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`bg-white rounded border p-3 shadow-sm hover:shadow transition-all cursor-pointer ${
        selected ? "ring-2 ring-blue-500 border-blue-300" : "hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-blue-600 text-xs font-semibold">{ticket.jiraKey}</span>
        {ticket.ticketType && (
          <span className="text-[10px] text-gray-400 uppercase shrink-0">{ticket.ticketType}</span>
        )}
      </div>
      <p className="text-sm text-gray-800 mt-1 line-clamp-2">{ticket.summary}</p>

      {/* Branch chain */}
      {branch && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-600 font-mono truncate max-w-[160px] inline-block">
              {branch.branch.name}
            </span>
            <PRBadge
              state={branch.branch.prState as any}
              url={branch.branch.prUrl}
              compact
            />
            {branch.branch.prTargetBranch && (
              <span className="text-[10px] text-gray-400">&rarr; {branch.branch.prTargetBranch}</span>
            )}
          </div>
          {branch.branchCommits.length > 0 && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              {branch.branchCommits.length} commit{branch.branchCommits.length !== 1 ? "s" : ""}, +{branch.branchCommits.reduce((s, c) => s + c.insertions, 0)} -{branch.branchCommits.reduce((s, c) => s + c.deletions, 0)}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {ticket.priority && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityColors[ticket.priority] ?? "bg-gray-100 text-gray-600"}`}>
            {ticket.priority}
          </span>
        )}
        {ticket.assignee && (
          <span className="text-[10px] text-gray-500">{ticket.assignee}</span>
        )}
        {commitCount > 0 && !branch && (
          <span className="text-[10px] text-gray-400 ml-auto">{commitCount} commit{commitCount !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Lifecycle footer */}
      {lifecycle && (
        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-gray-100 text-[10px] text-gray-400">
          <span title="Duration">
            <svg className="w-3 h-3 inline -mt-px mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
            {formatDuration(lifecycle)}
          </span>
          <span className="flex items-center gap-1" title={`Last activity ${formatIdleShort(lifecycle.idleDays)}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${idleDotColor(lifecycle.idleDays)}`} />
            {formatIdleShort(lifecycle.idleDays)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Ticket Detail Panel (below board) ───────────────────────────────────────

function TicketDetailPanel({
  ticket,
  config,
  branches,
  commitCount,
  lifecycle,
  onClose,
}: {
  ticket: Ticket;
  config: AppConfig;
  branches: BranchWithCommits[];
  commitCount: number;
  lifecycle?: TicketLifecycleSummary;
  onClose: () => void;
}) {
  const [summaries, setSummaries] = useState<TicketSummary[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(true);

  useEffect(() => {
    setLoadingSummaries(true);
    fetchTicketSummaries({ jiraKey: ticket.jiraKey }).then((data) => {
      setSummaries(data);
      setLoadingSummaries(false);
    });
  }, [ticket.jiraKey]);

  // Gather all commits across branches for this ticket
  const allCommits = branches.flatMap((b) => b.branchCommits);
  const totalInsertions = allCommits.reduce((s, c) => s + c.insertions, 0);
  const totalDeletions = allCommits.reduce((s, c) => s + c.deletions, 0);

  // Build email->name map from config
  const emailToName = new Map<string, string>();
  for (const member of config.team) {
    for (const email of member.emails) {
      emailToName.set(email.toLowerCase(), member.name);
    }
  }

  // Unique contributors
  const authorEmails = [...new Set(allCommits.map((c) => c.authorEmail))];
  const contributors = authorEmails.map((e) => emailToName.get(e.toLowerCase()) ?? e);

  return (
    <div className="bg-white overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 flex items-start justify-between gap-4 px-6 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <JiraLink config={config} jiraKey={ticket.jiraKey} className="text-blue-600 hover:text-blue-800 hover:underline font-semibold">
              {ticket.jiraKey}
            </JiraLink>
            {ticket.ticketType && (
              <span className="text-[10px] text-gray-400 uppercase px-1.5 py-0.5 rounded bg-gray-100">{ticket.ticketType}</span>
            )}
            {ticket.status && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                statusColors[ticket.status] ? statusColors[ticket.status] + " text-gray-700" : "bg-gray-200 text-gray-700"
              }`}>
                {ticket.status}
              </span>
            )}
            {ticket.priority && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityColors[ticket.priority] ?? "bg-gray-100 text-gray-600"}`}>
                {ticket.priority}
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{ticket.summary}</h3>
          {ticket.assignee && (
            <p className="text-sm text-gray-500 mt-1">Assignee: {ticket.assignee}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        {/* Stats row */}
        <div className="grid grid-cols-3 md:grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-800">{branches.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Branch{branches.length !== 1 ? "es" : ""}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-800">{allCommits.length || commitCount}</p>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Commits</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">+{totalInsertions}</p>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">/ <span className="text-red-600">-{totalDeletions}</span></p>
          </div>
          {lifecycle && (
            <>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-800">{formatDuration(lifecycle)}</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Duration</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className={`text-2xl font-bold ${lifecycle.idleDays <= 2 ? "text-green-600" : lifecycle.idleDays <= 7 ? "text-yellow-600" : lifecycle.idleDays <= 14 ? "text-orange-600" : "text-red-600"}`}>{lifecycle.idleDays}d</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Idle</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs font-medium text-gray-600 mt-1">{new Date(lifecycle.lastCommitDate).toLocaleDateString("en-CA")}</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Last Activity</p>
              </div>
            </>
          )}
        </div>

        {/* Contributors */}
        {contributors.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contributors</h4>
            <div className="flex flex-wrap gap-2">
              {contributors.map((name) => {
                const initials = name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
                const cCount = allCommits.filter((c) => (emailToName.get(c.authorEmail.toLowerCase()) ?? c.authorEmail) === name).length;
                return (
                  <div key={name} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-bold">
                      {initials}
                    </div>
                    <span className="text-xs font-medium text-gray-700">{name}</span>
                    <span className="text-[10px] text-gray-400">{cCount} commit{cCount !== 1 ? "s" : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Description */}
        {ticket.description && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</h4>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
              <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-6">{ticket.description}</p>
            </div>
          </div>
        )}

        {/* AI Summary */}
        {loadingSummaries ? (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Implementation Progress</h4>
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          </div>
        ) : summaries.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Implementation Progress</h4>
            <div className="space-y-3">
              {summaries.map((s) => (
                <div key={s.id} className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {s.repo && <span className="font-medium text-gray-600">{s.repo}</span>}
                      <span>{new Date(s.createdAt).toLocaleDateString("en-CA")}</span>
                      {s.runId && <span className="text-gray-400">Run #{s.runId}</span>}
                    </div>
                    <FollowUpButton sessionId={s.sessionId} ticketKey={ticket.jiraKey} />
                  </div>
                  <MarkdownRenderer content={s.summaryText} className="text-xs text-gray-700" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Implementation Progress</h4>
            <p className="text-sm text-gray-400 italic">No AI summary available yet. Run a scan with Claude summaries enabled.</p>
          </div>
        )}

        {/* Branches & PRs */}
        {branches.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Branches & Pull Requests</h4>
            <div className="space-y-2">
              {branches.map((b) => (
                <div key={b.branch.id} className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <BranchLink config={config} repo={b.branch.repo} branch={b.branch.name}>
                      <span className="text-xs font-mono text-gray-700 hover:text-blue-600">{b.branch.name}</span>
                    </BranchLink>
                    <span className="text-[10px] text-gray-400">{b.branch.repo}</span>
                    <PRBadge state={b.branch.prState as any} url={b.branch.prUrl} compact />
                    {b.branch.prTargetBranch && b.branch.prState && (
                      <span className="text-[10px] text-gray-400">&rarr; {b.branch.prTargetBranch}</span>
                    )}
                    {b.branch.prApprovals != null && b.branch.prApprovals > 0 && (
                      <span className="text-[10px] text-green-600">{b.branch.prApprovals} approval{b.branch.prApprovals !== 1 ? "s" : ""}</span>
                    )}
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {b.branchCommits.length} commit{b.branchCommits.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {b.branch.prTitle && (
                    <p className="text-xs text-gray-600 mt-1">{b.branch.prTitle}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commits table */}
        {allCommits.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Commits ({allCommits.length})
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="px-2 py-1.5 font-medium">SHA</th>
                    <th className="px-2 py-1.5 font-medium">Message</th>
                    <th className="px-2 py-1.5 font-medium">Author</th>
                    <th className="px-2 py-1.5 font-medium">Branch</th>
                    <th className="px-2 py-1.5 font-medium">+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {allCommits
                    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                    .map((c) => (
                    <tr key={c.sha} className="border-b border-gray-100 even:bg-gray-50/50">
                      <td className="px-2 py-1.5">
                        <CommitLink config={config} repo={c.repo} sha={c.sha}>
                          <span className="font-mono text-blue-600">{c.shortSha}</span>
                        </CommitLink>
                      </td>
                      <td className="px-2 py-1.5 max-w-sm truncate text-gray-700">{c.message.split("\n")[0]}</td>
                      <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">
                        {emailToName.get(c.authorEmail.toLowerCase()) ?? c.authorName}
                      </td>
                      <td className="px-2 py-1.5 text-gray-400 font-mono max-w-[120px] truncate">{c.branch}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
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
      </div>
    </div>
  );
}
