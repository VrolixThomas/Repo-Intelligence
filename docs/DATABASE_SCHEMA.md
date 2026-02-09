# Database Schema

SQLite database at `data/codingsummary.db`.

## Tables

### `runs`

Tracks each execution of the summarizer.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| started_at | TEXT | ISO timestamp |
| completed_at | TEXT | ISO timestamp (null if failed) |
| repos_scanned | INTEGER | Number of repos processed |
| commits_found | INTEGER | New commits found this run |
| report_path | TEXT | Path to generated markdown file |

### `commits`

Every commit seen across all repos. Core of the delta logic.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| sha | TEXT UNIQUE | Full commit hash |
| short_sha | TEXT | First 8 chars |
| repo | TEXT | Repo name from config |
| branch | TEXT | Branch name |
| author_name | TEXT | Git author name |
| author_email | TEXT | Git author email |
| message | TEXT | Full commit message |
| timestamp | TEXT | Commit timestamp (ISO) |
| files_changed | INTEGER | Number of files changed |
| insertions | INTEGER | Lines added |
| deletions | INTEGER | Lines removed |
| diff_summary | TEXT | `--stat` output |
| first_seen_run | INTEGER FK | Run ID when first discovered |
| jira_keys | TEXT | Comma-separated ticket IDs extracted |

### `tickets`

Jira ticket cache. Stores full ticket data to avoid repeated API calls.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| jira_key | TEXT UNIQUE | e.g. `PROJ-123` |
| summary | TEXT | Ticket title |
| description | TEXT | Full description (markdown) |
| status | TEXT | e.g. `In Progress`, `Done` |
| assignee | TEXT | Assignee display name |
| priority | TEXT | e.g. `High`, `Medium` |
| ticket_type | TEXT | e.g. `Story`, `Bug`, `Task` |
| parent_key | TEXT | Parent epic/story key |
| subtasks | TEXT | JSON array of subtask keys |
| labels | TEXT | JSON array of labels |
| comments_json | TEXT | JSON array of recent comments |
| last_fetched | TEXT | ISO timestamp of last API call |
| last_jira_updated | TEXT | Jira's `updated` field |
| data_json | TEXT | Full raw Jira response (JSON blob) |

**Cache logic**: Only re-fetch from Jira if `last_jira_updated` has changed (checked via JQL or lightweight API call).

### `branches`

Track branch lifecycle per team member.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| repo | TEXT | Repo name |
| name | TEXT | Branch name |
| author_email | TEXT | Primary author |
| first_seen | TEXT | When we first saw this branch |
| last_seen | TEXT | Last run where branch existed |
| last_commit_sha | TEXT | Most recent commit on branch |
| is_active | INTEGER | 1 if seen in latest run, 0 if gone |
| jira_key | TEXT | Extracted from branch name if present |

### `summaries`

AI-generated summaries, stored to avoid re-generating.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| run_id | INTEGER FK | Which run generated this |
| repo | TEXT | Repo name |
| author_email | TEXT | Team member |
| jira_key | TEXT | Related ticket (nullable) |
| commit_shas | TEXT | JSON array of commit SHAs covered |
| summary_text | TEXT | Claude Code's analysis (markdown) |
| created_at | TEXT | ISO timestamp |

## Indexes

```sql
CREATE INDEX idx_commits_sha ON commits(sha);
CREATE INDEX idx_commits_repo_branch ON commits(repo, branch);
CREATE INDEX idx_commits_author ON commits(author_email);
CREATE INDEX idx_commits_run ON commits(first_seen_run);
CREATE INDEX idx_tickets_key ON tickets(jira_key);
CREATE INDEX idx_branches_repo ON branches(repo, name);
CREATE INDEX idx_summaries_run ON summaries(run_id);
```

## Delta Detection Query

Find new commits since last run:

```sql
SELECT c.*
FROM commits c
WHERE c.first_seen_run = (SELECT MAX(id) FROM runs)
ORDER BY c.repo, c.author_email, c.timestamp;
```

Find tickets that need re-fetching:

```sql
-- Tickets referenced in new commits that haven't been fetched recently
SELECT DISTINCT jk.value as jira_key
FROM commits c, json_each(c.jira_keys) jk
WHERE c.first_seen_run = (SELECT MAX(id) FROM runs)
AND jk.value NOT IN (
  SELECT jira_key FROM tickets
  WHERE last_fetched > datetime('now', '-1 hour')
);
```
