# CodingSummary — Project Instructions

## Overview

CLI tool that generates daily team activity summaries from Git repos. Scans commits/branches, fetches Jira tickets, tracks Bitbucket PRs, generates AI summaries via Claude, stores everything in Supabase PostgreSQL, and produces markdown reports. Includes a web dashboard with 12 views, cron scheduling, standup reports, sprint summaries, and trend analytics.

## Documentation Rules

**When making code changes, always update README.md and CLAUDE.md to reflect the changes.** This includes: new CLI flags, new API endpoints, new views, new DB tables, new features, changed data flows, and architectural decisions. Both files must stay in sync with the codebase at all times.

## Runtime

Default to **Bun** for everything. No Node.js, npm, vite, or dotenv.

- `bun run scan.ts` — not `node scan.ts`
- `bun install` — not `npm install`
- Bun auto-loads `.env` — never use `dotenv`
- `postgres` (postgres.js) for DB driver — `drizzle-orm/postgres-js` for ORM
- `Bun.write()` / `Bun.file()` over `fs.writeFile` / `fs.readFile`
- `Bun.spawn()` for subprocess invocation
- Supabase CLI for migrations — `supabase db push` (not `drizzle-kit push`)

## CLI Commands

```bash
# Scanning
bun run scan.ts                        # full scan (24h) + DB + Claude summaries + report
bun run scan.ts --since 2026-02-01     # scan since specific date
bun run scan.ts --until 2026-02-08     # scan until specific date
bun run scan.ts --no-db                # scan without DB tracking (ad-hoc mode)
bun run scan.ts --no-summary           # scan + DB but skip Claude summarization
bun run scan.ts --diffs                # show commit diffs (first 3)
bun run scan.ts --repo /path --name x  # ad-hoc single repo (no config/DB)

# Cron mode
bun run scan.ts --cron                 # run in cron mode (infinite loop, daily scans)
bun run scan.ts --cron --cron-hour 9   # set cron hour (default: 9)
bun run scan.ts --cron --cron-minute 0 # set cron minute (default: 0)

# Sprint summaries
bun run scan.ts --sprint-summary       # generate sprint summary for active sprint
bun run scan.ts --sprint-id 123        # generate summary for specific sprint ID

# Follow-ups
bun run followup.ts PI-2589            # interactive follow-up on a Jira ticket
bun run followup.ts --member "Name"    # follow up on a team member
bun run followup.ts --run 8            # follow up on a specific run
bun run followup.ts --session <uuid>   # resume a Claude session directly

# Web dashboard
bun run web.ts                         # launch dashboard (default port 3100)
bun --hot web.ts                       # launch with hot reload

# Database
bun run db:push                        # push migrations to Supabase (remote)
bun run db:reset                       # reset Supabase database
bun run db:studio                      # open Drizzle Studio web UI
bun run db:test                        # run DB verification tests
bun run db:test -- --reset             # clear tables and run tests
```

## Project Structure

```
scan.ts                      # Main CLI entry point (scanning, cron, sprint summaries)
followup.ts                  # Interactive follow-up CLI
web.ts                       # Web dashboard server (Bun.serve + HTML import + JSON API)
db-test.ts                   # DB verification tests
config.toml                  # Repos, team, Jira, Bitbucket, Claude, web settings
.env                         # DATABASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, BITBUCKET_* (never commit)
drizzle.config.ts            # Drizzle ORM config (PostgreSQL dialect)
supabase/
  migrations/                # Supabase migration SQL files
    20260208000000_initial_schema.sql  # All 11 tables
data/
  reports/                   # Generated markdown reports
src/
  config.ts                  # TOML config loader + types
  cron.ts                    # Scheduling utilities (timezone-aware, Bun.sleep loop)
  sprint-summary.ts          # Sprint summary orchestrator (2x Claude invocations)
  git/
    scanner.ts               # Git fetch, branch listing, commit collection
    diff.ts                  # Per-commit diff retrieval
    author.ts                # Group commits/branches by team member
    branch-context.ts        # PR detection, base branch resolution, checkout/restore
  jira/
    client.ts                # Jira HTTP client (Basic Auth)
    tickets.ts               # Ticket fetching, ADF-to-plaintext, caching (1h TTL)
    sprints.ts               # Jira Agile API (boards, sprints, sprint issues)
  bitbucket/
    client.ts                # Bitbucket HTTP client (Basic Auth, reuses Jira creds)
    pullrequests.ts          # Bulk PR fetching (50/page, 2 pages max), branch matching
    pr-activity.ts           # PR activity timeline (approvals, comments, updates)
    comments.ts              # Comment fetching
    merged-prs.ts            # Merged PR tracking
    index.ts                 # Re-exports
  claude/
    prompt.ts                # Prompt builders (buildTicketPrompt, buildSprintTechnicalPrompt, buildSprintGeneralPrompt)
    invoke.ts                # Claude CLI wrapper (Bun.spawn, session continuity)
  db/
    schema.ts                # Drizzle schema (11 tables, pg-core)
    index.ts                 # DB connection (postgres.js + drizzle-orm/postgres-js)
    queries.ts               # All DB operations — async (runs, commits, branches, tickets, PRs, sprints, analytics, standup)
  report/
    generate.ts              # Markdown report assembly (per-run)
    sprint-report.ts         # Sprint summary markdown generator
  web/
    app.tsx                  # React SPA entry (hash-based routing, 12 views)
    styles.css               # Tailwind CSS
    components/
      Layout.tsx             # Main layout with navigation sidebar
      SprintSelector.tsx     # Sprint dropdown (global, affects ticket/branch views)
      SprintProgressBar.tsx  # Sprint progress visualization
      CalendarStrip.tsx      # Date range selector
      MemberDayCard.tsx      # Per-member activity card
      PRBadge.tsx            # PR status badge
      StatsCard.tsx          # Stat box component
      MarkdownRenderer.tsx   # Renders markdown text
      ExternalLink.tsx       # JiraLink, CommitLink, BranchLink, PRLink helpers
      FollowUpButton.tsx     # Launch follow-up sessions
      Pagination.tsx         # Pagination control
      views/
        SprintDashboard.tsx    # #sprint — progress bar, per-member stats, mini kanban
        StandupView.tsx        # #standup — yesterday/today/blockers per member
        ActivityView.tsx       # #activity — calendar strip, per-member daily cards
        AnalyticsView.tsx      # #analytics — 4 tabs: velocity, churn, PR cycle, burndown
        SprintSummaryView.tsx  # #sprint-summary — Claude-generated tech + exec summaries
        TicketBoard.tsx        # #tickets — kanban columns, sprint-scoped
        TicketLifecycleView.tsx # #lifecycle — status change timeline, stale detection
        PullRequestView.tsx    # #prs — TTFR/TTM metrics, reviewer analytics
        BranchView.tsx         # #branches — active branches, PR badges, sprint filter
        CommitLog.tsx          # #commits — chronological log with filtering
        MemberActivity.tsx     # #members — per-member breakdown
        RunOverview.tsx        # #runs — scan run history with summaries
      charts/
        LineChart.tsx          # Pure SVG line chart
        BarChart.tsx           # Pure SVG bar chart
        AreaChart.tsx          # Pure SVG area chart
        utils.ts               # Chart utility functions
```

## Architecture Rules

- **Supabase PostgreSQL** via `postgres` (postgres.js) + `drizzle-orm/postgres-js`
- **Migrations**: Raw SQL in `supabase/migrations/` via Supabase CLI (not `drizzle-kit push`)
- **All DB query functions are async** — callers must `await` every DB call
- **SELECT-then-INSERT** for commit delta detection — need to know which commits are new
- **Chunk at 500** for IN clauses (safe for PostgreSQL's 32,767 param limit)
- **Jira safety**: ONLY fetch tickets from projects in `config.jira.project_keys`
- **Claude prompts** capped at 50,000 chars — diffs dropped first, then branch diffs
- **Sequential** Claude invocation (one ticket at a time) to respect rate limits
- **Per-ticket summaries** via `ticket_summaries` table (not per-member). Orphan commits grouped under `branch:{name}` pseudo-keys
- **Bitbucket PR tracking**: bulk fetch (50/page, 2 pages max), match to branches by source branch name
- **Sprint sync** from Jira Agile API (`/rest/agile/1.0/board`, `/sprint`, `/sprint/{id}/issue`)
- **Cron mode**: timezone-aware scheduling via `Intl.DateTimeFormat`, `Bun.sleep` loop, auto-detects sprint close and triggers summary generation
- **Web**: React SPA + Tailwind via `bun-plugin-tailwind`, served by `Bun.serve()` with JSON API. Hash-based routing. Pure SVG charts (no D3/recharts)
- **View error handling**: All view components use `error` state (`string | null`), `.catch()` on every `.then()` chain, `.finally(() => setLoading(false))` to always clear loading, and display a red error banner when error is set. Reset `setError(null)` at the start of each fetch useEffect. Non-critical fetches (e.g. ticket summaries in drawer, PR filters) use `.catch(() => {})` to silently swallow errors.
- **Batch queries over N+1**: All read-path queries (`getBranchesWithCommits()`, `getSprintBranches()`, `getEnrichedDailyActivity()`, `getStandupData()`, `getSprintBurndown()`, `getAllMemberStats()`, `getMemberTicketSummaries()`, `getTicketLifecycleMetrics()`, `getPRDashboardStats()`, `getSprintMemberContributions()`) batch-fetch data in 1-5 queries then assemble in JS. All write-path upserts (`updateBranches()`, `upsertTickets()`, `upsertSprints()`, `upsertSprintTickets()`, `upsertPullRequests()`, `storePRActivities()`, `upsertTicketStatusChanges()`) batch-fetch existing records then bulk insert new ones. `computeAndCachePRMetrics()` computes TTFR/TTM/rounds in parallel.
- **Parallel endpoint queries**: `web.ts` uses `Promise.all()` for independent queries in `/api/sprints/:id`, `/api/tickets/by-status`, `/api/filters`, `/api/runs/:id`, `/api/team/:name`
- **Sprint-scoped PR stats**: `getSprintPRStats(sprintId)` computes merged count, avg merge time, and avg review rounds from PRs linked to sprint branches only (not global). Matches PRs by `(repo, prId)` pairs to avoid cross-repo PR number collisions. Used by sprint summary generation
- **PR-to-member matching**: `getSprintMemberContributions()` matches PRs to members via branch `authorEmail` → `team[].emails`, NOT via `pullRequests.authorName` (Bitbucket display names don't match Git author names)

## TypeScript

- `noUncheckedIndexedAccess` is enabled — array indexing returns `T | undefined`
- Use `match?.[1]` not `match[1]` for regex captures
- `strict: true` throughout
- Pre-existing TS errors in `src/git/scanner.ts` (simple-git types) — don't block runtime
- Use `e: any` for React event handlers to avoid DOM lib TS errors

## Config Types

```ts
interface Config {
  general: { output_dir: string; timezone: string };
  repos: { name: string; path: string; default_branch: string }[];
  jira: { base_url: string; project_keys: string[] };
  team: { name: string; emails: string[] }[];
  claude: { max_diff_lines: number };
  bitbucket?: { base_url: string; workspace: string };
  web?: { port: number };
}
```

Defaults applied in `loadConfig()`: `general.timezone` → `"UTC"`, `claude.max_diff_lines` → `500`, `bitbucket.base_url` → `"https://bitbucket.org"`, `web.port` → `3100`.

## Data Flow

```
config.toml → scan.ts → scanRepo() → commits + branches
  → await storeCommits() (delta) → await updateBranches() (mark-and-sweep)
  → fetchRepoPullRequests() (Bitbucket, bulk) → await updateBranchPR() → await upsertPullRequests()
  → fetchPRActivity() → await computePRMetrics() (TTFR, TTM, review rounds)
  → fetchTickets() (Jira, cached 1h) → filterAllowedKeys()
  → syncSprints() (Jira Agile API) → await upsertSprints() + await upsertSprintTickets()
  → await groupCommitsByTicket() → buildTicketPrompt() → invokeClaude() → await storeTicketSummary()
  → generateReport() → ./data/reports/{date}-run-{id}.md

Sprint summary (manual or auto on sprint close):
  → await loadSprintData() → buildSprintTechnicalPrompt() → invokeClaude()
  → buildSprintGeneralPrompt() → invokeClaude() → await storeSprintSummary()
  → generateSprintReport() → ./data/reports/sprint-{name}-{date}.md
```

## Environment Variables

- `DATABASE_URL` — Supabase PostgreSQL connection string (from `.env`)
- `JIRA_EMAIL` — Jira account email (from `.env`)
- `JIRA_API_TOKEN` — Jira API token (from `.env`)
- `BITBUCKET_EMAIL` — Bitbucket email (optional, falls back to `JIRA_EMAIL`)
- `BITBUCKET_API_TOKEN` — Bitbucket API token (optional, falls back to `JIRA_API_TOKEN`)

For local development: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`

Bitbucket uses email + API token for Basic Auth (App Passwords were deprecated Sep 2025).

## Database Schema (11 tables)

| Table | Purpose |
|-------|---------|
| `runs` | Scan run metadata (timestamps, stats, report path) |
| `commits` | Immutable commit log with delta detection (SHA unique) |
| `branches` | Active branch tracking with PR data (mark-and-sweep) |
| `tickets` | Cached Jira ticket data (1-hour TTL) |
| `ticketSummaries` | Claude-generated summaries per ticket+repo per run |
| `sprints` | Jira sprint metadata (active/closed/future) |
| `sprintTickets` | Sprint-to-ticket mapping |
| `sprintSummaries` | Claude-generated sprint tech + exec summaries |
| `pullRequests` | Bitbucket PR data with cycle time metrics |
| `prActivities` | PR activity timeline (approvals, comments, updates) |
| `ticketStatusChanges` | Jira ticket status change history (from changelog) |

## Web Dashboard

### 12 Views

| Hash Route | View | Description |
|------------|------|-------------|
| `#sprint` | SprintDashboard | Progress bar, per-member stats, mini kanban (default) |
| `#standup` | StandupView | Yesterday/today/blockers per member, date nav |
| `#activity` | ActivityView | Calendar strip, per-member daily cards |
| `#analytics` | AnalyticsView | 4 tabs: velocity, code churn, PR cycle time, sprint burndown |
| `#sprint-summary` | SprintSummaryView | Claude-generated technical + executive summaries |
| `#tickets` | TicketBoard | Kanban columns, sprint-scoped |
| `#lifecycle` | TicketLifecycleView | Status change timeline, stale detection |
| `#prs` | PullRequestView | TTFR/TTM metrics, reviewer analytics |
| `#branches` | BranchView | Active branches, PR badges, sprint filter |
| `#commits` | CommitLog | Chronological log with filtering |
| `#members` | MemberActivity | Per-member breakdown |
| `#runs` | RunOverview | Scan run history with summaries |

### API Endpoints

**Config & Stats**: `GET /api/config`, `GET /api/stats`, `GET /api/filters`

**Runs**: `GET /api/runs`, `GET /api/runs/:id`

**Commits**: `GET /api/commits?page=&pageSize=&repo=&author=&since=&until=&search=`

**Team**: `GET /api/team`, `GET /api/team/:name?page=&pageSize=`

**Tickets**: `GET /api/tickets/by-status?sprintId=`, `GET /api/tickets/lifecycle?sprintId=&sort=&staleThreshold=`, `GET /api/ticket-summaries?jiraKey=|runId=`

**Branches**: `GET /api/branches?repo=&author=`

**Sprints**: `GET /api/sprints`, `GET /api/sprints/active`, `GET /api/sprints/:id`

**Activity**: `GET /api/activity?date=`, `GET /api/activity/range?since=&until=`

**Standup**: `GET /api/standup?date=`

**Sprint Summaries**: `GET /api/sprint-summaries`, `GET /api/sprint-summary/:sprintId`

**Pull Requests**: `GET /api/pull-requests?page=&pageSize=&sort=&repo=&state=&author=&since=&until=`, `GET /api/pull-requests/:id`, `GET /api/pull-requests/stats?repo=`, `GET /api/pull-requests/reviewers?repo=`, `GET /api/pull-requests/filters`

**Analytics**: `GET /api/analytics/commit-velocity?since=&until=&member=`, `GET /api/analytics/code-churn?since=&until=`, `GET /api/analytics/pr-cycle-time?since=&until=`, `GET /api/analytics/sprint-burndown?sprintId=`

## Completed Phases

1. Core scaffolding (git scanner, config, author grouping)
2. SQLite persistence (5 tables, delta detection, branch tracking)
3. Jira integration (REST API client, ticket fetching/caching)
4. Claude Code integration (prompt builder, CLI wrapper, incremental analysis, follow-ups)
5. Report generation (markdown assembly, daily report files)
6. Web UI dashboard (React + Tailwind, Bun.serve, JSON API)
7. Sprint views, PR integration, daily activity calendar
8. Per-ticket summary refactor (ticket_summaries table, buildTicketPrompt, ticket-centric reports/dashboard)
9. PR review cycle tracking (pull_requests + pr_activities tables, activity timelines, TTFR/TTM/review rounds metrics, PullRequestView dashboard)
10. Trend analytics & velocity charts (ticket_status_changes, Jira changelog integration, AnalyticsView with 4 tabs, pure SVG charts)
11. Cron mode + standup view + sprint summary (daily scheduler, StandupView, Claude-generated sprint summaries, auto-trigger on sprint close)
12. Supabase migration (SQLite → PostgreSQL via postgres.js, all queries async, Supabase CLI migrations)
13. Dashboard loading fix (frontend error handling on all 12 views + app.tsx, N+1 query elimination in queries.ts, endpoint parallelization in web.ts)
14. Full N+1 audit (batch all write-path upserts, parallelize getPRDashboardStats/computeAndCachePRMetrics, batch getSprintBurndown commit counts, batch getSprintMemberContributions PR counts, filter getTicketLifecycleMetrics branch query, parallelize /api/runs/:id and /api/team/:name, remove dead getTeamDailyActivity)
15. Data accuracy fixes (`getSprintPRStats` repo-scoped PR matching, sprint burndown scoped to sprint branches via `getSprintDailyCommitCounts`, `getSprintBranches` filters on `isActive`)

## Key Gotchas

- `noUncheckedIndexedAccess` — `array[i]` returns `T | undefined`, use `?.[1]` for regex
- Pre-existing TS errors (simple-git types, DOM lib missing, `e.target.value`) — don't block runtime
- All DB queries are **async** — always `await` DB calls
- `postgres.js` manages its own connection pool — no singleton/reset pattern needed
- `DATABASE_URL` env var is required — Bun auto-loads from `.env`
- PostgreSQL `SUM()` returns `bigint` — use `::integer` cast in raw SQL
- Raw SQL uses `DATE()` and `COUNT(*)::integer` for PostgreSQL compatibility
- Bun path: `/Users/Werk/.bun/bin`, Claude CLI: `/Users/Werk/.local/bin/claude`
- Bun HTML import: use relative paths (`./styles.css`, `./app.tsx`)
- Use `e: any` for React event handlers to avoid DOM lib TS errors
- `bun-plugin-tailwind` configured in `bunfig.toml` under `[serve.static]`
- Bitbucket auth: email + API token Basic Auth. Resolves email from `BITBUCKET_EMAIL` → `JIRA_EMAIL`, token from `BITBUCKET_API_TOKEN` → `JIRA_API_TOKEN`
- Bitbucket App Passwords deprecated Sep 2025, replaced by API tokens (require email, not username)
- All view fetch chains must have `.catch()` and `.finally()` — never leave a `.then()` without error handling. Use `(err: any)` for catch callbacks
- Claude CLI `--session-id` creates a new session; use `--resume <id>` to continue an existing session. `invokeClaude()` supports both via `sessionId` and `resumeSessionId` options
- Hash-based routing supports query params: `#members?name=John` — use `getHashParam()` in `app.tsx` to read them
- SprintDashboard `buildMemberStats()` only includes `config.team` members — non-team commit authors are excluded
- CalendarStrip arrow buttons navigate to previous/next day (not just scroll)
- **PR IDs are per-repo** — always query `pullRequests` with both `repo` AND `prId`, never `prId` alone
- **Sprint burndown commits** use `getSprintDailyCommitCounts` (scoped to sprint branches), not `getDailyCommitCounts` (global)
- **Sprint branch queries** must filter `isActive = 1` to exclude deleted branches
