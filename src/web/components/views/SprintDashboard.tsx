import { useState, useEffect } from "react";
import { SprintProgressBar } from "../SprintProgressBar";
import { JiraLink } from "../ExternalLink";
import { PRBadge } from "../PRBadge";
import { fetchSprintDetail } from "../../api";
import type { AppConfig, Sprint, SprintDetail, BranchWithCommits, Ticket, View } from "../../types";

interface Props {
  config: AppConfig;
  sprint: Sprint;
  onNavigate: (view: View) => void;
}

const STATUS_ORDER = ["To Do", "In Progress", "In Review", "Done"];
const statusColors: Record<string, string> = {
  "To Do": "bg-gray-200 text-gray-700",
  "In Progress": "bg-blue-100 text-blue-700",
  "In Review": "bg-purple-100 text-purple-700",
  "Done": "bg-green-100 text-green-700",
};

export function SprintDashboard({ config, sprint, onNavigate }: Props) {
  const [detail, setDetail] = useState<SprintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSprintDetail(sprint.id).then((d) => {
      setDetail(d);
    }).catch((err: any) => setError(err?.message ?? "Failed to load data")).finally(() => setLoading(false));
  }, [sprint.id]);

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
  );

  if (loading || !detail) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-3 bg-gray-100 rounded w-full mb-4" />
          <div className="h-4 bg-gray-100 rounded w-2/3" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-16 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Build per-member stats
  const memberStats = buildMemberStats(config, detail);

  // Group tickets by status for mini kanban
  const ticketsByStatus = groupTicketsByStatus(detail.tickets);
  const allStatuses = Object.keys(ticketsByStatus);
  const orderedStatuses = [
    ...STATUS_ORDER.filter((s) => allStatuses.includes(s)),
    ...allStatuses.filter((s) => !STATUS_ORDER.includes(s)),
  ];

  return (
    <div className="space-y-6">
      {/* Sprint header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{sprint.name}</h2>
            {sprint.goal && (
              <p className="text-sm text-gray-500 mt-1">{sprint.goal}</p>
            )}
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            sprint.state === "active" ? "bg-green-100 text-green-700"
            : sprint.state === "closed" ? "bg-gray-100 text-gray-600"
            : "bg-blue-100 text-blue-700"
          }`}>
            {sprint.state}
          </span>
        </div>
        {sprint.startDate && sprint.endDate && (
          <SprintProgressBar startDate={sprint.startDate} endDate={sprint.endDate} />
        )}
        {!sprint.startDate && (
          <p className="text-sm text-gray-400">Not started</p>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Tickets" value={detail.stats.ticketCount} />
        <StatCard label="Commits" value={detail.stats.commitCount} />
        <StatCard label="Branches" value={detail.stats.branchCount} />
        <StatCard label="Pull Requests" value={detail.stats.prCount} />
      </div>

      {/* Per-member summary cards */}
      {memberStats.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Team Activity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberStats.map((ms) => (
              <button
                key={ms.name}
                onClick={() => onNavigate("activity")}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow text-left"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {getInitials(ms.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{ms.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{ms.commitCount} commit{ms.commitCount !== 1 ? "s" : ""}</span>
                  <span className="text-gray-300">|</span>
                  <span>{ms.branchCount} branch{ms.branchCount !== 1 ? "es" : ""}</span>
                  {ms.prCount > 0 && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span>{ms.prCount} PR{ms.prCount !== 1 ? "s" : ""}</span>
                    </>
                  )}
                </div>
                {ms.ticketKeys.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {ms.ticketKeys.slice(0, 4).map((k) => (
                      <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{k}</span>
                    ))}
                    {ms.ticketKeys.length > 4 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        +{ms.ticketKeys.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mini ticket kanban */}
      {orderedStatuses.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Sprint Tickets</h3>
            <button
              onClick={() => onNavigate("tickets")}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              View full board
            </button>
          </div>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(orderedStatuses.length, 4)}, minmax(0, 1fr))` }}
          >
            {orderedStatuses.map((status) => {
              const tickets = ticketsByStatus[status] ?? [];
              return (
                <div key={status} className="bg-gray-50 rounded-xl p-3 min-h-[120px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[status] ?? "bg-gray-200 text-gray-600"}`}>
                      {status}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto">{tickets.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {tickets.slice(0, 5).map((t) => {
                      const branch = detail.branches.find((b) => b.branch.jiraKey === t.jiraKey);
                      return (
                        <MiniTicketCard key={t.jiraKey} ticket={t} branch={branch} config={config} />
                      );
                    })}
                    {tickets.length > 5 && (
                      <p className="text-[10px] text-gray-400 pt-1">+{tickets.length - 5} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function MiniTicketCard({
  ticket,
  branch,
  config,
}: {
  ticket: Ticket;
  branch: BranchWithCommits | undefined;
  config: AppConfig;
}) {
  return (
    <div className="bg-white rounded border border-gray-100 px-2.5 py-2 shadow-sm">
      <div className="flex items-center gap-1.5">
        <JiraLink config={config} jiraKey={ticket.jiraKey} className="text-[10px] text-blue-600 hover:underline font-semibold shrink-0">
          {ticket.jiraKey}
        </JiraLink>
        <span className="text-[11px] text-gray-700 truncate">{ticket.summary}</span>
      </div>
      {branch && branch.branch.prId && (
        <div className="mt-1">
          <PRBadge
            state={branch.branch.prState as any}
            url={branch.branch.prUrl}
            compact
          />
        </div>
      )}
    </div>
  );
}

interface MemberStat {
  name: string;
  commitCount: number;
  branchCount: number;
  prCount: number;
  ticketKeys: string[];
}

function buildMemberStats(config: AppConfig, detail: SprintDetail): MemberStat[] {
  const emailToMember = new Map<string, string>();
  for (const m of config.team) {
    for (const e of m.emails) emailToMember.set(e.toLowerCase(), m.name);
  }

  const stats = new Map<string, MemberStat>();

  // Count commits per member
  for (const c of detail.commits) {
    const name = emailToMember.get(c.authorEmail.toLowerCase()) ?? c.authorName;
    if (!stats.has(name)) {
      stats.set(name, { name, commitCount: 0, branchCount: 0, prCount: 0, ticketKeys: [] });
    }
    stats.get(name)!.commitCount++;
    // Collect ticket keys
    if (c.jiraKeys) {
      for (const k of c.jiraKeys.split(",")) {
        const trimmed = k.trim();
        if (trimmed && !stats.get(name)!.ticketKeys.includes(trimmed)) {
          stats.get(name)!.ticketKeys.push(trimmed);
        }
      }
    }
  }

  // Count branches per member
  for (const b of detail.branches) {
    const name = emailToMember.get(b.branch.authorEmail.toLowerCase()) ?? b.branch.authorEmail;
    if (!stats.has(name)) {
      stats.set(name, { name, commitCount: 0, branchCount: 0, prCount: 0, ticketKeys: [] });
    }
    stats.get(name)!.branchCount++;
    if (b.branch.prId) stats.get(name)!.prCount++;
  }

  // Sort by most active
  return [...stats.values()].sort((a, b) => b.commitCount - a.commitCount);
}

function groupTicketsByStatus(tickets: Ticket[]): Record<string, Ticket[]> {
  const grouped: Record<string, Ticket[]> = {};
  for (const t of tickets) {
    const status = t.status ?? "Unknown";
    if (!grouped[status]) grouped[status] = [];
    grouped[status]!.push(t);
  }
  return grouped;
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0] ?? "").join("").toUpperCase().slice(0, 2);
}
