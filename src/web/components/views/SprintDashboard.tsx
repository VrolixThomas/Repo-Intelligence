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

const DONE_STATUSES = new Set(["Done", "Closed", "Resolved"]);
const IN_REVIEW_STATUSES = new Set(["In Review", "Code Review", "Review"]);
const IN_PROGRESS_STATUSES = new Set(["In Progress", "In Development", "Development"]);

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
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-16 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Compute sprint health metrics
  const health = computeSprintHealth(sprint, detail);
  const memberStats = buildMemberStats(config, detail);
  const attentionItems = computeAttentionItems(config, detail);

  // Group tickets by status for mini kanban
  const ticketsByStatus = groupTicketsByStatus(detail.tickets);
  const allStatuses = Object.keys(ticketsByStatus);
  const orderedStatuses = [
    ...STATUS_ORDER.filter((s) => allStatuses.includes(s)),
    ...allStatuses.filter((s) => !STATUS_ORDER.includes(s)),
  ];

  return (
    <div className="space-y-6">
      {/* Sprint header + progress */}
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

      {/* Sprint health — 4 stat cards with context */}
      <div className="grid grid-cols-4 gap-4">
        <HealthCard
          label="Completion"
          value={`${health.completionPct}%`}
          sub={`${health.doneCount} of ${health.totalTickets} tickets done`}
          color={health.completionPct >= health.timeElapsedPct ? "green" : health.completionPct >= health.timeElapsedPct * 0.7 ? "yellow" : "red"}
        />
        <HealthCard
          label="In Progress"
          value={String(health.inProgressCount)}
          sub={`${health.inReviewCount} in review`}
          color="blue"
        />
        <HealthCard
          label="Commits"
          value={String(detail.stats.commitCount)}
          sub={`${detail.stats.branchCount} branches`}
          color="gray"
        />
        <HealthCard
          label="Pull Requests"
          value={String(detail.stats.prCount)}
          sub={health.mergedPRs > 0 ? `${health.mergedPRs} merged` : "none merged"}
          color="gray"
        />
      </div>

      {/* Needs Attention — only show if there are items */}
      {attentionItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            Needs Attention
          </h3>
          <div className="space-y-2">
            {attentionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${
                  item.severity === "high" ? "bg-red-500" : "bg-amber-500"
                }`} />
                <span className="text-amber-900">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team — member cards with current focus */}
      {memberStats.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Team</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberStats.map((ms) => (
              <button
                key={ms.name}
                onClick={() => {
                  window.location.hash = `members?name=${encodeURIComponent(ms.name)}`;
                }}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow text-left"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white ${
                    ms.commitCount === 0 ? "bg-gray-400" : "bg-gradient-to-br from-blue-500 to-blue-600"
                  }`}>
                    {getInitials(ms.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{ms.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {ms.commitCount} commit{ms.commitCount !== 1 ? "s" : ""}
                      {ms.prCount > 0 && ` · ${ms.prCount} PR${ms.prCount !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                </div>
                {/* Current focus — show active ticket or branch */}
                {ms.activeTicket ? (
                  <div className="bg-blue-50/60 rounded-lg px-2.5 py-1.5 mt-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold text-blue-700">{ms.activeTicket.jiraKey}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[ms.activeTicket.status] ?? "bg-gray-200 text-gray-600"}`}>
                        {ms.activeTicket.status}
                      </span>
                    </div>
                    {ms.activeTicket.summary && (
                      <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-1">{ms.activeTicket.summary}</p>
                    )}
                  </div>
                ) : ms.ticketKeys.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ms.ticketKeys.slice(0, 4).map((k) => (
                      <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{k}</span>
                    ))}
                    {ms.ticketKeys.length > 4 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        +{ms.ticketKeys.length - 4}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-300 mt-1 italic">No tickets assigned</p>
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

// ── Health Card ───────────────────────────────────────────────────────────

function HealthCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: "green" | "yellow" | "red" | "blue" | "gray" }) {
  const colors = {
    green: "border-l-green-500",
    yellow: "border-l-amber-500",
    red: "border-l-red-500",
    blue: "border-l-blue-500",
    gray: "border-l-gray-300",
  };
  const valueCls = {
    green: "text-green-700",
    yellow: "text-amber-700",
    red: "text-red-700",
    blue: "text-blue-700",
    gray: "text-gray-900",
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 border-l-4 ${colors[color]}`}>
      <p className={`text-2xl font-bold ${valueCls[color]}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

// ── Mini Ticket Card ──────────────────────────────────────────────────────

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

// ── Data helpers ──────────────────────────────────────────────────────────

interface SprintHealth {
  totalTickets: number;
  doneCount: number;
  inProgressCount: number;
  inReviewCount: number;
  todoCount: number;
  completionPct: number;
  timeElapsedPct: number;
  mergedPRs: number;
}

function computeSprintHealth(sprint: Sprint, detail: SprintDetail): SprintHealth {
  let done = 0, inProgress = 0, inReview = 0, todo = 0;
  for (const t of detail.tickets) {
    const status = t.status ?? "";
    if (DONE_STATUSES.has(status)) done++;
    else if (IN_REVIEW_STATUSES.has(status)) inReview++;
    else if (IN_PROGRESS_STATUSES.has(status)) inProgress++;
    else todo++;
  }
  const total = detail.tickets.length;
  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;

  let timeElapsedPct = 0;
  if (sprint.startDate && sprint.endDate) {
    const start = new Date(sprint.startDate).getTime();
    const end = new Date(sprint.endDate).getTime();
    const now = Date.now();
    if (end > start) {
      timeElapsedPct = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
    }
  }

  const mergedPRs = detail.branches.filter((b) => b.branch.prState === "MERGED").length;

  return { totalTickets: total, doneCount: done, inProgressCount: inProgress, inReviewCount: inReview, todoCount: todo, completionPct, timeElapsedPct, mergedPRs };
}

interface AttentionItem {
  text: string;
  severity: "high" | "medium";
}

function computeAttentionItems(config: AppConfig, detail: SprintDetail): AttentionItem[] {
  const items: AttentionItem[] = [];

  // Stale PRs — open for more than 2 days
  const now = Date.now();
  const stalePRThresholdMs = 48 * 60 * 60 * 1000;
  for (const b of detail.branches) {
    if (b.branch.prState === "OPEN" && b.branch.prCreatedAt) {
      const age = now - new Date(b.branch.prCreatedAt).getTime();
      if (age > stalePRThresholdMs) {
        const days = Math.round(age / (24 * 60 * 60 * 1000));
        items.push({
          text: `PR "${b.branch.prTitle ?? b.branch.name}" open for ${days} days without merge`,
          severity: days > 5 ? "high" : "medium",
        });
      }
    }
  }

  // Tickets in progress with no branch/PR
  const branchedTicketKeys = new Set(detail.branches.map((b) => b.branch.jiraKey).filter(Boolean));
  for (const t of detail.tickets) {
    const status = t.status ?? "";
    if (IN_PROGRESS_STATUSES.has(status) && !branchedTicketKeys.has(t.jiraKey)) {
      items.push({
        text: `${t.jiraKey} is "In Progress" but has no branch or PR`,
        severity: "medium",
      });
    }
  }

  // Tickets in review with no PR
  for (const t of detail.tickets) {
    const status = t.status ?? "";
    if (IN_REVIEW_STATUSES.has(status)) {
      const branch = detail.branches.find((b) => b.branch.jiraKey === t.jiraKey);
      if (!branch || !branch.branch.prId) {
        items.push({
          text: `${t.jiraKey} is "In Review" but has no PR — may need status update`,
          severity: "medium",
        });
      }
    }
  }

  // Members with 0 commits
  const emailToMember = new Map<string, string>();
  const teamNames = new Set<string>();
  for (const m of config.team) {
    teamNames.add(m.name);
    for (const e of m.emails) emailToMember.set(e.toLowerCase(), m.name);
  }
  const activeMembers = new Set<string>();
  for (const c of detail.commits) {
    const name = emailToMember.get(c.authorEmail.toLowerCase());
    if (name) activeMembers.add(name);
  }
  const idleMembers = [...teamNames].filter((n) => !activeMembers.has(n));
  if (idleMembers.length > 0 && idleMembers.length < teamNames.size) {
    items.push({
      text: `${idleMembers.join(", ")} ha${idleMembers.length === 1 ? "s" : "ve"} no commits this sprint`,
      severity: "medium",
    });
  }

  return items.slice(0, 6); // cap to avoid overwhelming
}

interface MemberStat {
  name: string;
  commitCount: number;
  branchCount: number;
  prCount: number;
  ticketKeys: string[];
  activeTicket: { jiraKey: string; summary: string | null; status: string } | null;
}

function buildMemberStats(config: AppConfig, detail: SprintDetail): MemberStat[] {
  const emailToMember = new Map<string, string>();
  const teamNames = new Set<string>();
  for (const m of config.team) {
    teamNames.add(m.name);
    for (const e of m.emails) emailToMember.set(e.toLowerCase(), m.name);
  }

  // Initialize stats for all team members
  const stats = new Map<string, MemberStat>();
  for (const name of teamNames) {
    stats.set(name, { name, commitCount: 0, branchCount: 0, prCount: 0, ticketKeys: [], activeTicket: null });
  }

  // Count commits per member
  for (const c of detail.commits) {
    const name = emailToMember.get(c.authorEmail.toLowerCase());
    if (!name) continue;
    stats.get(name)!.commitCount++;
    if (c.jiraKeys) {
      for (const k of c.jiraKeys.split(",")) {
        const trimmed = k.trim();
        if (trimmed && !stats.get(name)!.ticketKeys.includes(trimmed)) {
          stats.get(name)!.ticketKeys.push(trimmed);
        }
      }
    }
  }

  // Count branches per member + find active ticket
  for (const b of detail.branches) {
    const name = emailToMember.get(b.branch.authorEmail.toLowerCase());
    if (!name) continue;
    stats.get(name)!.branchCount++;
    if (b.branch.prId) stats.get(name)!.prCount++;

    // Find the member's most active ticket (in progress or in review)
    if (b.branch.jiraKey && !stats.get(name)!.activeTicket) {
      const ticket = detail.tickets.find((t) => t.jiraKey === b.branch.jiraKey);
      if (ticket && (IN_PROGRESS_STATUSES.has(ticket.status ?? "") || IN_REVIEW_STATUSES.has(ticket.status ?? ""))) {
        stats.get(name)!.activeTicket = { jiraKey: ticket.jiraKey, summary: ticket.summary, status: ticket.status ?? "Unknown" };
      }
    }
  }

  // Sort: active members first, then by commit count
  return [...stats.values()].sort((a, b) => {
    if (a.commitCount === 0 && b.commitCount > 0) return 1;
    if (b.commitCount === 0 && a.commitCount > 0) return -1;
    return b.commitCount - a.commitCount;
  });
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
