# CodingSummary

A CLI tool that generates daily team activity summaries from Git repositories. Scans commits and branches, fetches Jira tickets, tracks Bitbucket pull requests, generates AI-powered summaries using Claude, stores everything in Supabase PostgreSQL, and serves a web dashboard with 12 views for sprint tracking, standup reports, analytics, and more.

## Features

- **Git scanning** — Collects commits, branches, and diffs across multiple repos with delta detection
- **Jira integration** — Fetches ticket metadata (status, assignee, description) with 1-hour cache, sprint sync via Agile API
- **Bitbucket PR tracking** — Bulk-fetches pull requests, tracks activity timelines, computes cycle time metrics (TTFR, TTM, review rounds)
- **Claude AI summaries** — Per-ticket context-aware summaries with incremental analysis, plus two-section sprint summaries (technical + executive)
- **Interactive follow-ups** — Resume Claude sessions to ask deeper questions about tickets, members, or runs
- **Sprint management** — Sprint sync from Jira, sprint-scoped views, auto-detect sprint close with summary generation
- **Web dashboard** — 12 views with error handling: sprint dashboard, standup, activity calendar, analytics (4 chart types), ticket board, PR metrics, and more. Batch-optimized DB queries and parallelized API endpoints
- **Cron scheduling** — Timezone-aware daily scans with auto sprint-close detection
- **Standup reports** — Yesterday/today/blockers per member with auto-detected blockers (stale PRs >48h, idle tickets >3d)
- **Trend analytics** — Commit velocity, code churn, PR cycle times, sprint burndown — all pure SVG charts
- **Supabase PostgreSQL** — 11 tables tracking runs, commits, branches, tickets, PRs, sprints, summaries, and analytics
- **Markdown reports** — Daily reports per scan run, sprint summary reports

## Prerequisites

- [Bun](https://bun.sh) — runtime and package manager
- [Supabase](https://supabase.com) — PostgreSQL database (cloud or local via `supabase start`)
- [Claude Code CLI](https://claude.ai/download) — for AI summaries (optional, can run `--no-summary`)
- Git repos cloned locally
- Jira API token — for ticket enrichment (optional)
- Bitbucket API token — for PR tracking (optional, falls back to Jira credentials)

## Quick Start

```bash
# Install dependencies
bun install

# Configure your repos, team, and integrations
# Edit config.toml (see Configuration section below)

# Set up credentials
echo 'DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres' >> .env
echo 'JIRA_EMAIL=your@email.com' >> .env
echo 'JIRA_API_TOKEN=your-jira-token' >> .env

# Apply database migrations (requires Supabase CLI)
supabase db push

# Run a scan
bun run scan.ts

# Launch the web dashboard
bun run web.ts
# Open http://localhost:3100
```

## Configuration

### config.toml

```toml
[general]
output_dir = "./data/reports"    # Where markdown reports are saved
timezone = "Europe/Amsterdam"     # Used for cron scheduling and date display

[[repos]]
name = "my-service"               # Display name
path = "/path/to/local/clone"     # Absolute path to git clone
default_branch = "main"           # Base branch for comparisons

[[repos]]
name = "another-repo"
path = "/path/to/another-repo"
default_branch = "dev"

[[team]]
name = "Alice Smith"
emails = ["alice@company.com", "a.smith@company.com"]   # All git author emails

[[team]]
name = "Bob Jones"
emails = ["bob@company.com"]

[jira]
base_url = "https://yourcompany.atlassian.net"
project_keys = ["PROJ"]          # Only tickets from these projects are fetched

[claude]
max_diff_lines = 500             # Max diff lines per commit in prompts

[bitbucket]
base_url = "https://bitbucket.org"    # Bitbucket server URL
workspace = "your-workspace"           # Bitbucket workspace/org

[web]
port = 3100                      # Web dashboard port
```

### Environment Variables

Set in `.env` (auto-loaded by Bun):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Supabase or local) |
| `JIRA_EMAIL` | For Jira | Jira account email |
| `JIRA_API_TOKEN` | For Jira | Jira API token |
| `BITBUCKET_EMAIL` | No | Bitbucket email (falls back to `JIRA_EMAIL`) |
| `BITBUCKET_API_TOKEN` | No | Bitbucket API token (falls back to `JIRA_API_TOKEN`) |

## CLI Reference

### scan.ts — Main scanner

```bash
bun run scan.ts                          # Full scan (last 24h) + DB + Claude summaries + report
bun run scan.ts --since 2026-02-01       # Scan since specific date
bun run scan.ts --until 2026-02-08       # Scan until specific date
bun run scan.ts --no-summary             # Skip Claude summarization (faster, data only)
bun run scan.ts --no-db                  # Quick scan without database persistence
bun run scan.ts --diffs                  # Show commit diffs (first 3)
bun run scan.ts --repo /path --name x    # Ad-hoc single repo scan (no config/DB)
```

**Cron mode** — runs scans on a daily schedule:

```bash
bun run scan.ts --cron                   # Daily scans (default: 09:00)
bun run scan.ts --cron --cron-hour 8     # Daily at 08:00
bun run scan.ts --cron --cron-minute 30  # Daily at 09:30
```

**Sprint summaries** — generate Claude AI sprint reports:

```bash
bun run scan.ts --sprint-summary         # Summary for active sprint
bun run scan.ts --sprint-id 123          # Summary for specific sprint
```

### followup.ts — Interactive follow-ups

```bash
bun run followup.ts PI-2589              # Follow up on a Jira ticket
bun run followup.ts --member "Alice"     # Follow up on a team member's work
bun run followup.ts --run 5              # Follow up on a specific scan run
bun run followup.ts --session <uuid>     # Resume a previous Claude session
```

Follow-ups resume the Claude session from the original summary, maintaining full conversation context and codebase access.

### web.ts — Web dashboard

```bash
bun run web.ts                           # Launch dashboard at http://localhost:3100
bun --hot web.ts                         # Launch with hot reload
```

### Database management

```bash
supabase db push                         # Apply migrations to Supabase PostgreSQL
supabase db reset                        # Reset database and re-apply migrations
bun run db:studio                        # Browse data in Drizzle Studio web UI
bun run db:test                          # Run DB verification tests
bun run db:test -- --reset               # Clear all tables and run tests
```

## Web Dashboard

The dashboard is a React SPA served by Bun with 12 views accessible via hash routes.

### Sprint Dashboard (`#sprint`) — Default View

Sprint health at a glance with actionable insights. Shows:
- **Health cards** — completion % (color-coded vs time elapsed), in-progress/review counts, commits, PRs merged
- **Needs Attention** — stale PRs (open >2 days), tickets in progress without branches, tickets in review without PRs, idle team members
- **Team cards** — each member's current focus (active ticket + status), commit/PR counts. Clicking navigates to `#members` with member pre-selected
- **Mini kanban** — ticket status distribution with links to full board

Only configured team members shown (non-team commit authors excluded).

### Daily Standup (`#standup`)

Two-column layout per member: Yesterday + Current Focus, with blockers promoted to a top-level banner.
- **Blockers** (top banner) — stale PRs with clickable links + age in days, idle tickets with links
- **Yesterday** — ticket status transitions with status badges, merged PRs with links, full Claude-generated summaries in cards
- **Current Focus** — active tickets in highlighted cards with status badges and full summary text, active branches, open PR count

Date navigation with "Today" badge indicator. All items are clickable links to Jira/Bitbucket.

### Activity Calendar (`#activity`)

Calendar strip with per-member daily activity cards showing commits, tickets touched, and branch activity. Arrow buttons navigate to previous/next day.

### Analytics (`#analytics`)

Four tabs with pure SVG charts:
- **Commit Velocity** — commits per member over time (line chart)
- **Code Churn** — daily additions vs deletions (area chart)
- **PR Cycle Time** — time to first review, time to merge, review rounds (bar chart)
- **Sprint Burndown** — ticket completion over sprint duration (area chart)

### Sprint Report (`#sprint-summary`)

Claude-generated sprint summaries with two sections:
- **Technical Summary** — organized by feature area, highlighting architecture changes and key decisions
- **Executive Summary** — high-level progress for stakeholders

Includes sprint stats (tickets completed, in progress, PRs merged).

### Ticket Board (`#tickets`)

Kanban-style board with tickets grouped by status. Sprint-scoped — the global sprint selector filters tickets to the selected sprint.

### Ticket Lifecycle (`#lifecycle`)

Status change timeline for tickets with stale detection. Shows how long tickets spend in each status, highlights idle tickets.

### Pull Requests (`#prs`)

PR dashboard with:
- Paginated PR list with filtering by state, repo, author, date range
- **TTFR** (Time to First Review), **TTM** (Time to Merge), **Review Rounds** metrics
- Reviewer analytics — review counts, approval rates per reviewer
- Dashboard stats — total merged, average merge time, average review rounds

### Branches (`#branches`)

Active branch listing with PR status badges, commit counts, and sprint filtering.

### Commits (`#commits`)

Chronological commit log with filtering by repo, author, date range, and search text. Paginated.

### Members (`#members`)

Per-member detail view with commit stats, branch activity, and ticket summaries.

### Runs (`#runs`)

Historical scan run list with metadata (repos scanned, commits found, timestamp) and links to generated summaries.

## Cron Mode

Run `bun run scan.ts --cron` to start a persistent process that scans daily at a configured time.

- **Timezone-aware**: uses `Intl.DateTimeFormat` with the configured timezone
- **Bun.sleep loop**: calculates milliseconds until next run, sleeps, scans, repeats
- **Sprint close detection**: when a sprint transitions from active to closed, automatically generates a sprint summary
- **Error resilient**: catches scan errors and continues to the next scheduled run

## Sprint Summaries

Sprint summaries are generated via two sequential Claude invocations:

1. **Technical summary** — prompted with all sprint data (tickets, commits, PRs, member contributions, status breakdown). Organized by feature area.
2. **Executive summary** — prompted with the technical summary as context plus sprint stats. Written for stakeholders.

**Trigger methods:**
- Manual: `bun run scan.ts --sprint-summary` or `--sprint-id <id>`
- Automatic: cron mode detects sprint close and triggers generation

Output: stored in `sprint_summaries` table and saved as `data/reports/sprint-{name}-{date}.md`.

## Data Flow

```
┌─ config.toml ─────────────────────────────────────────────────────┐
│ repos, team members, Jira config, Bitbucket config, Claude config │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            ▼
┌─ scan.ts ─────────────────────────────────────────────────────────┐
│ For each repo:                                                     │
│   scanRepo() → commits + branches                                  │
│   storeCommits() → delta detection (only new commits)              │
│   updateBranches() → mark-and-sweep                                │
│   fetchRepoPullRequests() → bulk Bitbucket PR fetch                │
│   fetchPRActivity() → activity timelines                           │
│   computePRMetrics() → TTFR, TTM, review rounds                   │
│                                                                    │
│ Cross-repo:                                                        │
│   fetchTickets() → Jira REST API (cached 1h)                      │
│   syncSprints() → Jira Agile API                                  │
│   groupCommitsByTicket() → per-ticket grouping                     │
│   buildTicketPrompt() → invokeClaude() → storeTicketSummary()     │
│   generateReport() → markdown file                                 │
└────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─ Supabase PostgreSQL (11 tables) ────────────────────────────────┐
│ runs, commits, branches, tickets, ticketSummaries, sprints,       │
│ sprintTickets, sprintSummaries, pullRequests, prActivities,       │
│ ticketStatusChanges                                                │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─ web.ts ─────────────────────────────────────────────────────────┐
│ Bun.serve() → JSON API + React SPA                                │
│ 12 views: sprint, standup, activity, analytics, tickets,          │
│ lifecycle, PRs, branches, commits, members, runs, sprint-summary  │
└──────────────────────────────────────────────────────────────────┘
```

## Database Schema

11 tables managed by Drizzle ORM with Supabase PostgreSQL:

| Table | Purpose |
|-------|---------|
| `runs` | Scan run metadata — timestamps, repos scanned, commits found, report path |
| `commits` | Immutable commit log — SHA (unique), repo, branch, author, message, diff stats, Jira keys |
| `branches` | Active branch tracking — mark-and-sweep lifecycle, PR data (id, state, url, reviewers) |
| `tickets` | Cached Jira ticket data — key, summary, status, assignee, priority, type, subtasks, labels (1h TTL) |
| `ticketSummaries` | Claude-generated summaries — per ticket+repo per run, with commit SHAs and session ID |
| `sprints` | Jira sprint metadata — ID, name, state (active/closed/future), start/end dates, goal |
| `sprintTickets` | Sprint-to-ticket mapping — which tickets belong to which sprint |
| `sprintSummaries` | Sprint summary data — technical + executive summaries, stats JSON, report path |
| `pullRequests` | Bitbucket PR data — state, branches, reviewers, approvals, comments, merge commit, cycle time metrics |
| `prActivities` | PR activity timeline — approvals, comments, updates, request_changes with timestamps |
| `ticketStatusChanges` | Jira status change history — from/to status, changed by, timestamp (from changelog API) |

## API Reference

All endpoints served by `web.ts` at `http://localhost:{port}/api/`.

### Configuration & Stats
- `GET /api/config` — Returns timezone, Jira base URL, Bitbucket config, repos, team
- `GET /api/stats` — Dashboard summary statistics
- `GET /api/filters` — Available filter options (repos, authors)

### Runs
- `GET /api/runs` — List all scan runs
- `GET /api/runs/:id` — Run detail with ticket summaries, commits, tickets

### Commits
- `GET /api/commits` — Paginated commit list
  - Query: `page`, `pageSize`, `repo`, `author`, `since`, `until`, `search`

### Team & Members
- `GET /api/team` — All team members with stats
- `GET /api/team/:name` — Member detail (stats, commits, branches, ticket summaries)
  - Query: `page`, `pageSize`

### Tickets
- `GET /api/tickets/by-status` — Tickets grouped by status (with lifecycle metrics, commit counts)
  - Query: `sprintId`
- `GET /api/tickets/lifecycle` — Ticket lifecycle metrics (stale detection, idle duration)
  - Query: `sprintId`, `sort`, `staleThreshold`
- `GET /api/ticket-summaries` — Claude-generated ticket summaries
  - Query: `jiraKey` or `runId`

### Branches
- `GET /api/branches` — Branch list with commit counts
  - Query: `repo`, `author`

### Sprints
- `GET /api/sprints` — All sprints
- `GET /api/sprints/active` — Currently active sprint
- `GET /api/sprints/:id` — Sprint detail (tickets, branches, commits, stats)

### Activity
- `GET /api/activity` — Enriched daily activity for a date
  - Query: `date`
- `GET /api/activity/range` — Daily commit counts over a date range
  - Query: `since`, `until`

### Standup
- `GET /api/standup` — Standup data (yesterday/today activity, blockers per member)
  - Query: `date`

### Sprint Summaries
- `GET /api/sprint-summaries` — All sprint summaries
- `GET /api/sprint-summary/:sprintId` — Specific sprint summary

### Pull Requests
- `GET /api/pull-requests` — Paginated PR list
  - Query: `page`, `pageSize`, `sort`, `repo`, `state`, `author`, `since`, `until`
- `GET /api/pull-requests/:id` — PR detail with activities and metrics
- `GET /api/pull-requests/stats` — Dashboard stats (merged count, avg merge time, avg review rounds)
  - Query: `repo`
- `GET /api/pull-requests/reviewers` — Reviewer analytics
  - Query: `repo`
- `GET /api/pull-requests/filters` — Available PR filter options

### Analytics
- `GET /api/analytics/commit-velocity` — Commit velocity by member
  - Query: `since`, `until`, `member`
- `GET /api/analytics/code-churn` — Daily code churn (additions/deletions)
  - Query: `since`, `until`
- `GET /api/analytics/pr-cycle-time` — PR cycle time metrics
  - Query: `since`, `until`
- `GET /api/analytics/sprint-burndown` — Sprint burndown chart data
  - Query: `sprintId`

## Architecture

- **Runtime**: [Bun](https://bun.sh) — runtime, package manager, bundler, server
- **Database**: Supabase PostgreSQL via [postgres.js](https://github.com/porsager/postgres) + [Drizzle ORM](https://orm.drizzle.team) (Supabase CLI migrations)
- **Frontend**: React 19 + Tailwind CSS via `bun-plugin-tailwind`, hash-based SPA routing
- **Charts**: Pure SVG (LineChart, BarChart, AreaChart) — no chart libraries
- **Config**: TOML via [smol-toml](https://github.com/nicolo-ribaudo/smol-toml)
- **Git**: [simple-git](https://github.com/steveukx/git-js)
- **AI**: [Claude Code CLI](https://claude.ai/download) via `Bun.spawn()`
- **Jira**: REST API v3 + Agile API v1 with Basic Auth
- **Bitbucket**: REST API v2 with Basic Auth (email + API token)

### Performance Indexes

Key indexes beyond primary keys and unique constraints:
- `commits(timestamp)` — all analytics, calendar, sprint-scoped queries
- `commits(author_email, timestamp)` — member queries with timestamp range/sort
- `branches(jira_key)` — sprint-scoped branch queries
- `branches(is_active, author_email)` — member stats, standup, branch view

### Key Design Decisions

- **Delta detection**: SELECT existing SHAs before INSERT — only new commits are processed each run
- **Mark-and-sweep branches**: Mark all inactive → upsert current → remaining are "gone"
- **Per-ticket summaries**: Summaries are per ticket+repo (not per member), orphan commits grouped under `branch:{name}` pseudo-keys
- **Incremental Claude analysis**: Previous summaries passed as context — only new commits trigger re-analysis
- **Session continuity**: Claude session IDs stored for follow-up resumption
- **Prompt size guard**: 50K char cap — diffs dropped first, then branch diffs, ticket/branch lists never dropped
- **Sequential Claude invocations**: One ticket at a time to respect rate limits
- **Disposable DB**: Schema managed by Supabase CLI migrations, DB can be reset and rebuilt anytime
- **Async DB queries**: All database operations are async via postgres.js connection pool
- **Batch over N+1**: All read and write-path queries batch-fetch existing records upfront, then assemble/upsert in JS — no per-item SELECT loops. Independent queries parallelized with `Promise.all()`
