# CodingSummary - Project Plan

## Goal

Every morning, run a single command that produces a complete markdown summary of what the team has been doing — across multiple repos, linked to Jira tickets, with full context. Claude Code runs directly in each repo (no API key needed) to analyze code changes and generate summaries.

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                  Orchestrator (Bun)                  │
│                                                     │
│  1. Read config (repos, team members)               │
│  2. For each repo: git fetch, collect branch/commit  │
│     data, diff stats                                │
│  3. Query Jira Cloud API for linked tickets         │
│  4. Store raw data in SQLite                        │
│  5. Detect what's NEW since last run                │
│  6. Invoke Claude Code CLI per repo with context    │
│  7. Collect AI summaries → final markdown report    │
└─────────────────────────────────────────────────────┘
```

### Step-by-step flow

1. **Config load** — Read `config.toml` (repos paths, team members, Jira project, etc.)
2. **Git scan** — For each repo:
   - `git fetch --all`
   - List remote branches, filter by team members (branch naming convention or git author)
   - Collect commits since last run (stored in SQLite)
   - Gather diffs/stats for new commits
3. **Jira enrichment** — For each commit message:
   - Extract ticket IDs (e.g. `PROJ-123` patterns)
   - Fetch ticket details from Jira Cloud REST API (summary, description, status, assignee, comments, subtasks)
   - Cache ticket data in SQLite — only re-fetch if ticket updated since last check
4. **Delta detection** — Compare against SQLite state:
   - Which commits are new?
   - Which tickets have status changes?
   - Which branches are new / deleted?
5. **Claude Code analysis** — For each repo with new activity:
   - `cd` into the repo
   - Run `claude -p` (print mode) with a structured prompt containing:
     - New commits + diffs
     - Jira ticket context
     - Ask: what changed, why, what's left to do
   - Claude Code has full repo access to read files for deeper context
6. **Report generation** — Combine all summaries into a single dated markdown file:
   - `reports/2024-01-15.md`
   - Organized by team member → repo → ticket

## Phases

### Phase 1: Core scaffolding ✅
- [x] Project setup (Bun + TypeScript + SQLite/Drizzle)
- [x] Config file schema (`config.toml`)
- [x] Git scanner module (fetch, branches, commits, diffs)
- [x] Author grouping by team member email

### Phase 1.5: SQLite persistence layer ✅
- [x] Drizzle ORM schema (5 tables: runs, commits, branches, tickets, summaries)
- [x] DB connection singleton with `bun:sqlite`
- [x] Delta detection (SELECT-then-INSERT, SHA chunking)
- [x] Branch tracking (mark-and-sweep: new/updated/gone)
- [x] Run lifecycle (start → scan → store → complete)
- [x] DB test script with --reset flag
- [x] Real config with provider-service repo + team emails

### Phase 2: Jira integration
- [ ] Jira Cloud REST API client (auth via API token in env)
- [ ] Ticket ID extraction from commit messages and branch names
- [ ] Ticket detail fetcher (description, status, comments, subtasks)
- [ ] Caching layer in SQLite (tickets table)

### Phase 3: Claude Code integration
- [ ] Prompt templates for code analysis
- [ ] Claude Code CLI invocation (`claude -p` with piped context)
- [ ] Response parsing and structuring
- [ ] Per-repo analysis orchestration

### Phase 4: Report generation
- [ ] Markdown report template
- [ ] Delta-aware reporting (highlight what's new)
- [ ] Daily report file output
- [ ] Historical report browsing (Next.js UI, optional)

### Phase 5: Polish
- [ ] Next.js dashboard to browse reports
- [ ] Cron/launchd setup for automatic morning runs
- [ ] Error handling and retry logic
- [ ] Support for configurable team/branch detection rules

## CLI Commands

```bash
# Scanning
bun run scan.ts                          # full scan with DB tracking (last 24h)
bun run scan.ts --since 2026-02-01       # scan since specific date
bun run scan.ts --no-db                  # scan without DB (ad-hoc mode)
bun run scan.ts --repo /path --name label  # single repo scan (no config/DB)
bun run scan.ts --diffs                  # include diffs for first 3 commits

# Database
bun run db:push                          # push Drizzle schema to SQLite
bun run db:studio                        # open Drizzle Studio (web UI for DB)
bun run db:test                          # run DB verification tests
bun run db:test -- --reset               # wipe DB, rebuild schema, run tests
```

## Accessing the Database

```bash
# Option 1: Drizzle Studio (web UI) — recommended
bun run db:studio

# Option 2: SQLite CLI
sqlite3 data/codingsummary.db

# Useful queries:
sqlite3 data/codingsummary.db "SELECT id, started_at, completed_at, repos_scanned, commits_found FROM runs ORDER BY id DESC LIMIT 5;"
sqlite3 data/codingsummary.db "SELECT short_sha, author_name, branch, substr(message,1,60) FROM commits ORDER BY timestamp DESC LIMIT 20;"
sqlite3 data/codingsummary.db "SELECT repo, name, is_active, jira_key FROM branches WHERE is_active = 1 ORDER BY last_seen DESC LIMIT 20;"
sqlite3 data/codingsummary.db "SELECT author_email, COUNT(*) as commit_count FROM commits GROUP BY author_email ORDER BY commit_count DESC;"
```
