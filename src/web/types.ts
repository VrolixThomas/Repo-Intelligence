export interface AppConfig {
  timezone: string;
  jiraBaseUrl: string;
  bitbucket: { base_url: string; workspace: string };
  repos: { name: string; defaultBranch: string }[];
  team: { name: string; emails: string[] }[];
}

export interface DashboardStats {
  totalRuns: number;
  totalCommits: number;
  activeMembers: number;
  activeTickets: number;
}

export interface Run {
  id: number;
  startedAt: string;
  completedAt: string | null;
  reposScanned: number | null;
  commitsFound: number | null;
  reportPath: string | null;
  scanSince: string | null;
  scanUntil: string | null;
}

export interface Commit {
  id: number;
  sha: string;
  shortSha: string;
  repo: string;
  branch: string;
  authorName: string;
  authorEmail: string;
  message: string;
  timestamp: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  diffSummary: string | null;
  firstSeenRun: number | null;
  jiraKeys: string | null;
}

export interface TicketSummary {
  id: number;
  runId: number | null;
  jiraKey: string;
  repo: string | null;
  commitShas: string | null;
  authorEmails: string | null;
  branchNames: string | null;
  summaryText: string;
  sessionId: string | null;
  createdAt: string;
}

export interface Ticket {
  id: number;
  jiraKey: string;
  summary: string | null;
  description: string | null;
  status: string | null;
  assignee: string | null;
  priority: string | null;
  ticketType: string | null;
  parentKey: string | null;
  subtasks: string | null;
  labels: string | null;
  lastFetched: string | null;
  lastJiraUpdated: string | null;
}

export interface TeamMember {
  name: string;
  emails: string[];
  commitCount: number;
  activeBranchCount: number;
  lastActivity: string | null;
}

export interface Branch {
  id: number;
  repo: string;
  name: string;
  authorEmail: string;
  firstSeen: string;
  lastSeen: string;
  lastCommitSha: string | null;
  isActive: number;
  jiraKey: string | null;
  prId: number | null;
  prTitle: string | null;
  prState: string | null;
  prUrl: string | null;
  prTargetBranch: string | null;
  prReviewers: string | null;
  prApprovals: number | null;
  prCreatedAt: string | null;
  prUpdatedAt: string | null;
}

export interface RunDetail {
  run: Run;
  ticketSummaries: TicketSummary[];
  commits: Commit[];
  tickets: Ticket[];
}

export interface MemberDetail {
  name: string;
  emails: string[];
  commitCount: number;
  activeBranchCount: number;
  lastActivity: string | null;
  commits: Commit[];
  total: number;
  branches: Branch[];
  ticketSummaries: TicketSummary[];
}

export interface TicketLifecycleSummary {
  durationDays: number;
  durationHours: number;
  idleDays: number;
  firstCommitDate: string;
  lastCommitDate: string;
}

export interface TicketsByStatus {
  grouped: Record<string, Ticket[]>;
  commitCounts: Record<string, number>;
  lifecycle: Record<string, TicketLifecycleSummary>;
}

export interface BranchWithCommits {
  branch: Branch;
  branchCommits: Commit[];
  ticket: Ticket | null;
}

export interface Sprint {
  id: number;
  jiraSprintId: number;
  boardId: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
  lastFetched: string | null;
}

export interface SprintDetail {
  sprint: Sprint;
  tickets: Ticket[];
  branches: BranchWithCommits[];
  commits: Commit[];
  commitCounts: Record<string, number>;
  stats: {
    ticketCount: number;
    commitCount: number;
    branchCount: number;
    prCount: number;
  };
}

export interface DailyBranchDetail {
  name: string;
  repo: string;
  branch: Branch | null;
  ticket: Ticket | null;
}

export interface DailyActivity {
  member: { name: string; emails: string[] };
  commits: Commit[];
  branches: DailyBranchDetail[];
  tickets: Ticket[];
  ticketSummaries: TicketSummary[];
}

export interface DailyCommitCount {
  date: string;
  count: number;
}

export interface TicketLifecycleMetric {
  jiraKey: string;
  firstCommitDate: string;
  lastCommitDate: string;
  durationDays: number;
  durationHours: number;
  idleDays: number;
  commitCount: number;
  authorCount: number;
  authorEmails: string[];
  repos: string[];
  branchCount: number;
  isStale: boolean;
  ticket: Ticket | null;
}

export interface TicketLifecycleResponse {
  metrics: TicketLifecycleMetric[];
  staleThreshold: number;
  summary: {
    totalTracked: number;
    staleCount: number;
    avgDuration: number;
    avgIdle: number;
  };
}

export interface PullRequest {
  id: number;
  repo: string;
  prId: number;
  title: string;
  description: string | null;
  state: string;
  url: string;
  sourceBranch: string;
  targetBranch: string;
  authorName: string | null;
  reviewers: string | null;
  approvals: number | null;
  commentCount: number | null;
  taskCount: number | null;
  mergeCommitSha: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityFetched: string | null;
  timeToFirstReviewMins: number | null;
  timeToMergeMins: number | null;
  reviewRounds: number | null;
}

export interface PRActivity {
  id: number;
  pullRequestId: number;
  repo: string;
  prId: number;
  activityType: string;
  actorName: string | null;
  timestamp: string;
  newState: string | null;
  commentText: string | null;
  commitHash: string | null;
}

export interface PRDetail {
  pr: PullRequest;
  activities: PRActivity[];
  branch: Branch | null;
  ticket: Ticket | null;
  commits: Commit[];
}

export interface PRDashboardStats {
  totalOpen: number;
  totalMerged: number;
  totalDeclined: number;
  avgTimeToMergeHours: number;
  avgTimeToFirstReviewHours: number;
  avgReviewRounds: number;
  prsWithoutReview: number;
}

export interface ReviewerStat {
  reviewerName: string;
  prsReviewed: number;
  totalApprovals: number;
  totalChangesRequested: number;
  avgResponseTimeMins: number;
}

export interface PRFilters {
  repos: string[];
  authors: string[];
  states: string[];
}

// ── Analytics Types ──────────────────────────────────────────────────────

export interface CommitVelocityPoint { date: string; authorEmail: string; count: number }
export interface CommitVelocityData { points: CommitVelocityPoint[]; members: string[] }
export interface CodeChurnPoint { date: string; insertions: number; deletions: number; filesChanged: number; commitCount: number }
export interface CodeChurnData { points: CodeChurnPoint[] }
export interface PRCycleTimePoint { date: string; timeToMergeMins: number; timeToFirstReviewMins: number | null; reviewRounds: number; repo: string; authorName: string | null; prId: number }
export interface PRCycleTimeData { points: PRCycleTimePoint[]; avgTimeToMergeMins: number; medianTimeToMergeMins: number }
export interface SprintBurndownDay { date: string; todo: number; inProgress: number; inReview: number; done: number; remaining: number; commitsToday: number }
export interface SprintBurndownData { sprint: { name: string; startDate: string | null; endDate: string | null }; days: SprintBurndownDay[]; totalTickets: number }

// ── Standup Types ───────────────────────────────────────────────────────

export interface StandupMemberData {
  member: { name: string; emails: string[] };
  yesterday: {
    commits: Commit[];
    ticketsMoved: { jiraKey: string; summary: string | null; fromStatus: string; toStatus: string }[];
    prsMerged: { prId: number; title: string; repo: string }[];
    summaries: { jiraKey: string; summaryText: string }[];
  };
  today: {
    activeBranches: { name: string; repo: string; jiraKey: string | null; prState: string | null }[];
    activeTickets: { jiraKey: string; summary: string | null; status: string }[];
    openPRs: { prId: number; title: string; repo: string; createdAt: string }[];
  };
  blockers: {
    stalePRs: { prId: number; title: string; repo: string; ageHours: number }[];
    idleTickets: { jiraKey: string; summary: string | null; idleDays: number }[];
  };
}

// ── Sprint Summary Types ────────────────────────────────────────────────

export interface SprintSummaryData {
  id: number;
  sprintId: number;
  runId: number | null;
  technicalSummary: string;
  generalSummary: string;
  statsJson: string | null;
  reportPath: string | null;
  sessionId: string | null;
  createdAt: string;
}

export type View = "sprint" | "standup" | "activity" | "analytics" | "tickets" | "branches" | "commits" | "members" | "runs" | "lifecycle" | "prs" | "sprint-summary";
