-- Performance indexes for dashboard/analytics queries
-- Addresses full table scans on commits.timestamp, branches.jira_key,
-- and branches(is_active, author_email)

-- 1. commits.timestamp — used by all analytics, calendar, sprint-scoped queries
CREATE INDEX idx_commits_timestamp ON commits("timestamp");

-- 2. Replace commits(author_email) with commits(author_email, timestamp)
--    Composite covers leading-column lookups AND timestamp range scans
DROP INDEX idx_commits_author;
CREATE INDEX idx_commits_author_timestamp ON commits(author_email, "timestamp");

-- 3. branches.jira_key — used by all sprint-scoped branch queries
CREATE INDEX idx_branches_jira_key ON branches(jira_key);

-- 4. branches(is_active, author_email) — used by member stats, standup, branch view
CREATE INDEX idx_branches_active_author ON branches(is_active, author_email);
