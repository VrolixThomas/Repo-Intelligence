import type {
  AppConfig,
  DashboardStats,
  Run,
  RunDetail,
  Commit,
  TeamMember,
  MemberDetail,
  TicketsByStatus,
  BranchWithCommits,
  Sprint,
  SprintDetail,
  DailyActivity,
  DailyCommitCount,
  TicketSummary,
  TicketLifecycleResponse,
  PullRequest,
  PRDetail,
  PRDashboardStats,
  ReviewerStat,
  PRFilters,
  CommitVelocityData,
  CodeChurnData,
  PRCycleTimeData,
  SprintBurndownData,
  StandupMemberData,
  SprintSummaryData,
} from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchConfig(): Promise<AppConfig> {
  return get("/api/config");
}

export function fetchStats(): Promise<DashboardStats> {
  return get("/api/stats");
}

export function fetchRuns(): Promise<Run[]> {
  return get("/api/runs");
}

export function fetchRunDetail(id: number): Promise<RunDetail> {
  return get(`/api/runs/${id}`);
}

export function fetchCommits(params: {
  page?: number;
  pageSize?: number;
  repo?: string;
  author?: string;
  since?: string;
  until?: string;
  search?: string;
}): Promise<{ commits: Commit[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.repo) qs.set("repo", params.repo);
  if (params.author) qs.set("author", params.author);
  if (params.since) qs.set("since", params.since);
  if (params.until) qs.set("until", params.until);
  if (params.search) qs.set("search", params.search);
  return get(`/api/commits?${qs.toString()}`);
}

export function fetchTeam(): Promise<TeamMember[]> {
  return get("/api/team");
}

export function fetchMemberDetail(
  name: string,
  page = 1,
  pageSize = 20
): Promise<MemberDetail> {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return get(`/api/team/${encodeURIComponent(name)}?${qs.toString()}`);
}

export function fetchTicketsByStatus(sprintId?: number): Promise<TicketsByStatus> {
  const qs = sprintId ? `?sprintId=${sprintId}` : "";
  return get(`/api/tickets/by-status${qs}`);
}

export function fetchFilters(): Promise<{ repos: string[]; authors: string[] }> {
  return get("/api/filters");
}

export function fetchBranches(params?: {
  repo?: string;
  author?: string;
}): Promise<BranchWithCommits[]> {
  const qs = new URLSearchParams();
  if (params?.repo) qs.set("repo", params.repo);
  if (params?.author) qs.set("author", params.author);
  const query = qs.toString();
  return get(`/api/branches${query ? `?${query}` : ""}`);
}

// ── Sprint API ──────────────────────────────────────────────────────────────

export function fetchSprints(): Promise<Sprint[]> {
  return get("/api/sprints");
}

export function fetchActiveSprint(): Promise<Sprint | null> {
  return get("/api/sprints/active");
}

export function fetchSprintDetail(id: number): Promise<SprintDetail> {
  return get(`/api/sprints/${id}`);
}

// ── Activity API ────────────────────────────────────────────────────────────

export function fetchActivity(date: string): Promise<DailyActivity[]> {
  return get(`/api/activity?date=${date}`);
}

export function fetchActivityRange(since: string, until: string): Promise<DailyCommitCount[]> {
  return get(`/api/activity/range?since=${since}&until=${until}`);
}

// ── Ticket Summary API ──────────────────────────────────────────────────────

// ── Ticket Lifecycle API ────────────────────────────────────────────────

export function fetchTicketLifecycle(params?: {
  sprintId?: number;
  sort?: string;
  staleThreshold?: number;
}): Promise<TicketLifecycleResponse> {
  const qs = new URLSearchParams();
  if (params?.sprintId) qs.set("sprintId", String(params.sprintId));
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.staleThreshold) qs.set("staleThreshold", String(params.staleThreshold));
  const query = qs.toString();
  return get(`/api/tickets/lifecycle${query ? `?${query}` : ""}`);
}

export function fetchTicketSummaries(params?: {
  jiraKey?: string;
  runId?: number;
}): Promise<TicketSummary[]> {
  const qs = new URLSearchParams();
  if (params?.jiraKey) qs.set("jiraKey", params.jiraKey);
  if (params?.runId) qs.set("runId", String(params.runId));
  const query = qs.toString();
  return get(`/api/ticket-summaries${query ? `?${query}` : ""}`);
}

// ── Pull Request API ────────────────────────────────────────────────────

export function fetchPullRequests(params?: {
  repo?: string;
  state?: string;
  author?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}): Promise<{ pullRequests: PullRequest[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.repo) qs.set("repo", params.repo);
  if (params?.state) qs.set("state", params.state);
  if (params?.author) qs.set("author", params.author);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sort) qs.set("sort", params.sort);
  const query = qs.toString();
  return get(`/api/pull-requests${query ? `?${query}` : ""}`);
}

export function fetchPullRequestDetail(id: number): Promise<PRDetail> {
  return get(`/api/pull-requests/${id}`);
}

export function fetchPRStats(repo?: string): Promise<PRDashboardStats> {
  const qs = repo ? `?repo=${encodeURIComponent(repo)}` : "";
  return get(`/api/pull-requests/stats${qs}`);
}

export function fetchPRReviewers(repo?: string): Promise<ReviewerStat[]> {
  const qs = repo ? `?repo=${encodeURIComponent(repo)}` : "";
  return get(`/api/pull-requests/reviewers${qs}`);
}

export function fetchPRFilters(): Promise<PRFilters> {
  return get("/api/pull-requests/filters");
}

// ── Analytics API ────────────────────────────────────────────────────────

export function fetchCommitVelocity(since: string, until: string, member?: string): Promise<CommitVelocityData> {
  const qs = new URLSearchParams({ since, until });
  if (member) qs.set("member", member);
  return get(`/api/analytics/commit-velocity?${qs.toString()}`);
}

export function fetchCodeChurn(since: string, until: string): Promise<CodeChurnData> {
  const qs = new URLSearchParams({ since, until });
  return get(`/api/analytics/code-churn?${qs.toString()}`);
}

export function fetchPRCycleTime(since?: string, until?: string): Promise<PRCycleTimeData> {
  const qs = new URLSearchParams();
  if (since) qs.set("since", since);
  if (until) qs.set("until", until);
  const query = qs.toString();
  return get(`/api/analytics/pr-cycle-time${query ? `?${query}` : ""}`);
}

export function fetchSprintBurndown(sprintId: number): Promise<SprintBurndownData> {
  return get(`/api/analytics/sprint-burndown?sprintId=${sprintId}`);
}

// ── Standup API ──────────────────────────────────────────────────────────

export function fetchStandup(date: string): Promise<StandupMemberData[]> {
  return get(`/api/standup?date=${date}`);
}

// ── Sprint Summary API ──────────────────────────────────────────────────

export function fetchSprintSummary(sprintId: number): Promise<SprintSummaryData> {
  return get(`/api/sprint-summary/${sprintId}`);
}

export function fetchSprintSummaries(): Promise<SprintSummaryData[]> {
  return get("/api/sprint-summaries");
}
