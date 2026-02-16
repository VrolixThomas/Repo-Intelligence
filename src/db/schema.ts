import { pgTable, text, integer, serial, index, uniqueIndex } from "drizzle-orm/pg-core";

// ── Runs ──────────────────────────────────────────────────────────────────────
export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  reposScanned: integer("repos_scanned"),
  commitsFound: integer("commits_found"),
  reportPath: text("report_path"),
  scanSince: text("scan_since"),
  scanUntil: text("scan_until"),
});

// ── Commits ───────────────────────────────────────────────────────────────────
export const commits = pgTable(
  "commits",
  {
    id: serial("id").primaryKey(),
    sha: text("sha").notNull().unique(),
    shortSha: text("short_sha").notNull(),
    repo: text("repo").notNull(),
    branch: text("branch").notNull(),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email").notNull(),
    message: text("message").notNull(),
    timestamp: text("timestamp").notNull(),
    filesChanged: integer("files_changed").notNull().default(0),
    insertions: integer("insertions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    diffSummary: text("diff_summary"),
    firstSeenRun: integer("first_seen_run").references(() => runs.id),
    jiraKeys: text("jira_keys"),
  },
  (table) => [
    index("idx_commits_sha").on(table.sha),
    index("idx_commits_repo_branch").on(table.repo, table.branch),
    index("idx_commits_author_timestamp").on(table.authorEmail, table.timestamp),
    index("idx_commits_run").on(table.firstSeenRun),
    index("idx_commits_timestamp").on(table.timestamp),
  ]
);

// ── Branches ──────────────────────────────────────────────────────────────────
export const branches = pgTable(
  "branches",
  {
    id: serial("id").primaryKey(),
    repo: text("repo").notNull(),
    name: text("name").notNull(),
    authorEmail: text("author_email").notNull(),
    firstSeen: text("first_seen").notNull(),
    lastSeen: text("last_seen").notNull(),
    lastCommitSha: text("last_commit_sha"),
    lastCommitDate: text("last_commit_date"),
    isActive: integer("is_active").notNull().default(1),
    jiraKey: text("jira_key"),
    prId: integer("pr_id"),
    prTitle: text("pr_title"),
    prState: text("pr_state"),
    prUrl: text("pr_url"),
    prTargetBranch: text("pr_target_branch"),
    prReviewers: text("pr_reviewers"),
    prApprovals: integer("pr_approvals").default(0),
    prCreatedAt: text("pr_created_at"),
    prUpdatedAt: text("pr_updated_at"),
  },
  (table) => [
    index("idx_branches_repo_name").on(table.repo, table.name),
    index("idx_branches_jira_key").on(table.jiraKey),
    index("idx_branches_active_author").on(table.isActive, table.authorEmail),
  ]
);

// ── Tickets ───────────────────────────────────────────────────────────────────
export const tickets = pgTable(
  "tickets",
  {
    id: serial("id").primaryKey(),
    jiraKey: text("jira_key").notNull().unique(),
    summary: text("summary"),
    description: text("description"),
    status: text("status"),
    assignee: text("assignee"),
    priority: text("priority"),
    ticketType: text("ticket_type"),
    parentKey: text("parent_key"),
    subtasks: text("subtasks"),
    labels: text("labels"),
    commentsJson: text("comments_json"),
    lastFetched: text("last_fetched"),
    lastJiraUpdated: text("last_jira_updated"),
    dataJson: text("data_json"),
  },
  (table) => [
    index("idx_tickets_key").on(table.jiraKey),
  ]
);

// ── Ticket Summaries ─────────────────────────────────────────────────────────
export const ticketSummaries = pgTable(
  "ticket_summaries",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").references(() => runs.id),
    jiraKey: text("jira_key").notNull(),
    repo: text("repo"),
    commitShas: text("commit_shas"),
    authorEmails: text("author_emails"),
    branchNames: text("branch_names"),
    summaryText: text("summary_text").notNull(),
    sessionId: text("session_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_ticket_summaries_run").on(table.runId),
    index("idx_ticket_summaries_key").on(table.jiraKey),
    index("idx_ticket_summaries_key_repo").on(table.jiraKey, table.repo),
  ]
);

// ── Sprints ──────────────────────────────────────────────────────────────────
export const sprints = pgTable(
  "sprints",
  {
    id: serial("id").primaryKey(),
    jiraSprintId: integer("jira_sprint_id").notNull().unique(),
    boardId: integer("board_id").notNull(),
    name: text("name").notNull(),
    state: text("state").notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    goal: text("goal"),
    lastFetched: text("last_fetched"),
  },
  (table) => [
    index("idx_sprints_jira_id").on(table.jiraSprintId),
    index("idx_sprints_state").on(table.state),
  ]
);

// ── Sprint Tickets ───────────────────────────────────────────────────────────
export const sprintTickets = pgTable(
  "sprint_tickets",
  {
    id: serial("id").primaryKey(),
    sprintId: integer("sprint_id").notNull().references(() => sprints.id),
    jiraKey: text("jira_key").notNull(),
  },
  (table) => [
    uniqueIndex("idx_sprint_tickets_unique").on(table.sprintId, table.jiraKey),
    index("idx_sprint_tickets_sprint").on(table.sprintId),
  ]
);

// ── Pull Requests ────────────────────────────────────────────────────────
export const pullRequests = pgTable(
  "pull_requests",
  {
    id: serial("id").primaryKey(),
    repo: text("repo").notNull(),
    prId: integer("pr_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    state: text("state").notNull(),
    url: text("url").notNull(),
    sourceBranch: text("source_branch").notNull(),
    targetBranch: text("target_branch").notNull(),
    authorName: text("author_name"),
    reviewers: text("reviewers"),
    approvals: integer("approvals").default(0),
    commentCount: integer("comment_count").default(0),
    taskCount: integer("task_count").default(0),
    mergeCommitSha: text("merge_commit_sha"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastActivityFetched: text("last_activity_fetched"),
    timeToFirstReviewMins: integer("time_to_first_review_mins"),
    timeToMergeMins: integer("time_to_merge_mins"),
    reviewRounds: integer("review_rounds").default(0),
  },
  (table) => [
    uniqueIndex("idx_pull_requests_repo_prid").on(table.repo, table.prId),
    index("idx_pull_requests_state").on(table.state),
    index("idx_pull_requests_source").on(table.sourceBranch),
  ]
);

// ── Ticket Status Changes ────────────────────────────────────────────────
export const ticketStatusChanges = pgTable(
  "ticket_status_changes",
  {
    id: serial("id").primaryKey(),
    jiraKey: text("jira_key").notNull(),
    changedAt: text("changed_at").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedBy: text("changed_by"),
  },
  (table) => [
    index("idx_ticket_status_changes_key").on(table.jiraKey),
    index("idx_ticket_status_changes_key_date").on(table.jiraKey, table.changedAt),
  ]
);

// ── Sprint Summaries ─────────────────────────────────────────────────────
export const sprintSummaries = pgTable(
  "sprint_summaries",
  {
    id: serial("id").primaryKey(),
    sprintId: integer("sprint_id").notNull(),
    runId: integer("run_id"),
    technicalSummary: text("technical_summary").notNull(),
    generalSummary: text("general_summary").notNull(),
    statsJson: text("stats_json"),
    reportPath: text("report_path"),
    sessionId: text("session_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_sprint_summaries_sprint").on(table.sprintId),
  ]
);

// ── PR Activities ────────────────────────────────────────────────────────
export const prActivities = pgTable(
  "pr_activities",
  {
    id: serial("id").primaryKey(),
    pullRequestId: integer("pull_request_id").notNull(),
    repo: text("repo").notNull(),
    prId: integer("pr_id").notNull(),
    activityType: text("activity_type").notNull(),
    actorName: text("actor_name"),
    timestamp: text("timestamp").notNull(),
    newState: text("new_state"),
    commentText: text("comment_text"),
    commitHash: text("commit_hash"),
  },
  (table) => [
    index("idx_pr_activities_pr").on(table.pullRequestId),
    index("idx_pr_activities_repo_prid").on(table.repo, table.prId),
  ]
);
