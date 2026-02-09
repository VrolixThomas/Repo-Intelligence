-- CodingSummary initial schema for Supabase (PostgreSQL)

-- 1. runs
CREATE TABLE runs (
  id SERIAL PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  repos_scanned INTEGER,
  commits_found INTEGER,
  report_path TEXT,
  scan_since TEXT,
  scan_until TEXT
);

-- 2. commits
CREATE TABLE commits (
  id SERIAL PRIMARY KEY,
  sha TEXT NOT NULL UNIQUE,
  short_sha TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  message TEXT NOT NULL,
  "timestamp" TEXT NOT NULL,
  files_changed INTEGER NOT NULL DEFAULT 0,
  insertions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  diff_summary TEXT,
  first_seen_run INTEGER REFERENCES runs(id),
  jira_keys TEXT
);
CREATE INDEX idx_commits_sha ON commits(sha);
CREATE INDEX idx_commits_repo_branch ON commits(repo, branch);
CREATE INDEX idx_commits_author ON commits(author_email);
CREATE INDEX idx_commits_run ON commits(first_seen_run);

-- 3. branches
CREATE TABLE branches (
  id SERIAL PRIMARY KEY,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  last_commit_sha TEXT,
  last_commit_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  jira_key TEXT,
  pr_id INTEGER,
  pr_title TEXT,
  pr_state TEXT,
  pr_url TEXT,
  pr_target_branch TEXT,
  pr_reviewers TEXT,
  pr_approvals INTEGER DEFAULT 0,
  pr_created_at TEXT,
  pr_updated_at TEXT
);
CREATE INDEX idx_branches_repo_name ON branches(repo, name);

-- 4. tickets
CREATE TABLE tickets (
  id SERIAL PRIMARY KEY,
  jira_key TEXT NOT NULL UNIQUE,
  summary TEXT,
  description TEXT,
  status TEXT,
  assignee TEXT,
  priority TEXT,
  ticket_type TEXT,
  parent_key TEXT,
  subtasks TEXT,
  labels TEXT,
  comments_json TEXT,
  last_fetched TEXT,
  last_jira_updated TEXT,
  data_json TEXT
);
CREATE INDEX idx_tickets_key ON tickets(jira_key);

-- 5. ticket_summaries
CREATE TABLE ticket_summaries (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES runs(id),
  jira_key TEXT NOT NULL,
  repo TEXT,
  commit_shas TEXT,
  author_emails TEXT,
  branch_names TEXT,
  summary_text TEXT NOT NULL,
  session_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ticket_summaries_run ON ticket_summaries(run_id);
CREATE INDEX idx_ticket_summaries_key ON ticket_summaries(jira_key);
CREATE INDEX idx_ticket_summaries_key_repo ON ticket_summaries(jira_key, repo);

-- 6. sprints
CREATE TABLE sprints (
  id SERIAL PRIMARY KEY,
  jira_sprint_id INTEGER NOT NULL UNIQUE,
  board_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  goal TEXT,
  last_fetched TEXT
);
CREATE INDEX idx_sprints_jira_id ON sprints(jira_sprint_id);
CREATE INDEX idx_sprints_state ON sprints(state);

-- 7. sprint_tickets
CREATE TABLE sprint_tickets (
  id SERIAL PRIMARY KEY,
  sprint_id INTEGER NOT NULL REFERENCES sprints(id),
  jira_key TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_sprint_tickets_unique ON sprint_tickets(sprint_id, jira_key);
CREATE INDEX idx_sprint_tickets_sprint ON sprint_tickets(sprint_id);

-- 8. pull_requests
CREATE TABLE pull_requests (
  id SERIAL PRIMARY KEY,
  repo TEXT NOT NULL,
  pr_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  state TEXT NOT NULL,
  url TEXT NOT NULL,
  source_branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  author_name TEXT,
  reviewers TEXT,
  approvals INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  task_count INTEGER DEFAULT 0,
  merge_commit_sha TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_activity_fetched TEXT,
  time_to_first_review_mins INTEGER,
  time_to_merge_mins INTEGER,
  review_rounds INTEGER DEFAULT 0
);
CREATE UNIQUE INDEX idx_pull_requests_repo_prid ON pull_requests(repo, pr_id);
CREATE INDEX idx_pull_requests_state ON pull_requests(state);
CREATE INDEX idx_pull_requests_source ON pull_requests(source_branch);

-- 9. pr_activities
CREATE TABLE pr_activities (
  id SERIAL PRIMARY KEY,
  pull_request_id INTEGER NOT NULL,
  repo TEXT NOT NULL,
  pr_id INTEGER NOT NULL,
  activity_type TEXT NOT NULL,
  actor_name TEXT,
  "timestamp" TEXT NOT NULL,
  new_state TEXT,
  comment_text TEXT,
  commit_hash TEXT
);
CREATE INDEX idx_pr_activities_pr ON pr_activities(pull_request_id);
CREATE INDEX idx_pr_activities_repo_prid ON pr_activities(repo, pr_id);

-- 10. ticket_status_changes
CREATE TABLE ticket_status_changes (
  id SERIAL PRIMARY KEY,
  jira_key TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT
);
CREATE INDEX idx_ticket_status_changes_key ON ticket_status_changes(jira_key);
CREATE INDEX idx_ticket_status_changes_key_date ON ticket_status_changes(jira_key, changed_at);

-- 11. sprint_summaries
CREATE TABLE sprint_summaries (
  id SERIAL PRIMARY KEY,
  sprint_id INTEGER NOT NULL,
  run_id INTEGER,
  technical_summary TEXT NOT NULL,
  general_summary TEXT NOT NULL,
  stats_json TEXT,
  report_path TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_sprint_summaries_sprint ON sprint_summaries(sprint_id);
