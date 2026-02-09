# Architecture

## Overview

CodingSummary is a CLI-first tool with an optional web UI. The core loop is:

```
config.toml → Git Scanner → Jira Client → SQLite State → Claude Code CLI → Markdown Report
```

## Components

### 1. Orchestrator (`src/orchestrator.ts`)

The main entry point. Reads config, coordinates all modules, runs the daily pipeline.

```
bun run summarize         # run the daily summary
bun run summarize --dry   # show what would be analyzed, no AI calls
bun run summarize --since 2024-01-10  # custom date range
```

### 2. Git Scanner (`src/git/`)

Wraps git CLI commands via Bun's `$` shell. No dependencies on git libraries.

- `scanner.ts` — fetch, list branches, get commits
- `diff.ts` — collect diffs for new commits
- `author.ts` — map commits to team members

Key design decisions:
- Uses `git log --format` with custom format strings for reliable parsing
- Identifies team members by git author email (configured in `config.toml`)
- Branches are matched by remote tracking branches, not local

### 3. Jira Client (`src/jira/`)

Direct REST API calls to Jira Cloud. No SDK dependency.

- `client.ts` — base HTTP client with auth (email + API token from env)
- `tickets.ts` — fetch ticket details, comments, subtasks
- `extractor.ts` — regex extraction of ticket IDs from strings

Auth: `JIRA_EMAIL` and `JIRA_API_TOKEN` in `.env`, base URL in `config.toml`.

### 4. State Database (`src/db/`)

SQLite via Drizzle ORM. Single file database at `data/codingsummary.db`.

Tables:
- `runs` — timestamp of each summary run
- `commits` — sha, author, message, repo, branch, timestamp, run_id
- `tickets` — jira_key, summary, status, last_fetched, data (JSON blob)
- `branches` — name, repo, author, first_seen, last_seen

The delta logic: on each run, compare new git commits against stored ones. Only new commits trigger Claude Code analysis.

### 5. Claude Code Integration (`src/claude/`)

Invokes Claude Code CLI in print mode (`claude -p`) per repo.

- `invoker.ts` — spawns claude process, pipes prompt, collects output
- `prompts.ts` — prompt templates for different analysis types
- `parser.ts` — structures the raw markdown response

How it works:
```ts
// Simplified
const prompt = buildPrompt(newCommits, diffs, jiraTickets);
const result = await $`claude -p ${prompt}`.cwd(repoPath).text();
```

Claude Code runs inside the repo directory, so it has full access to:
- Read any file for context
- Understand the codebase structure
- Correlate changes across files

### 6. Report Generator (`src/report/`)

Assembles the final markdown from all collected data.

Structure of a daily report:
```markdown
# Team Summary — 2024-01-15

## Alice
### repo-frontend
#### PROJ-123: Implement user settings page
- **Status**: In Progress
- **What it's about**: [from Jira description]
- **What changed today**: [from Claude Code analysis]
  - 3 commits on branch `feature/PROJ-123-user-settings`
  - Added settings form component, API route, validation
- **What's left**: [from Claude Code + Jira subtasks]

### repo-backend
...

## Bob
...

---
*Generated at 08:00 by CodingSummary*
```

### 7. Web UI (Next.js, optional — Phase 5)

Browse historical reports, search by team member or ticket. App Router pages:
- `/` — latest report
- `/reports/[date]` — specific day
- `/tickets/[key]` — ticket timeline across days
- `/team/[name]` — member's activity over time

## Directory Structure

```
CodingSummary/
├── src/
│   ├── orchestrator.ts        # main pipeline
│   ├── config.ts              # config loader
│   ├── git/
│   │   ├── scanner.ts         # branch & commit collection
│   │   ├── diff.ts            # diff extraction
│   │   └── author.ts          # author mapping
│   ├── jira/
│   │   ├── client.ts          # HTTP client
│   │   ├── tickets.ts         # ticket fetcher
│   │   └── extractor.ts       # ticket ID extraction
│   ├── db/
│   │   ├── schema.ts          # Drizzle schema
│   │   ├── index.ts           # DB connection
│   │   └── queries.ts         # common queries
│   ├── claude/
│   │   ├── invoker.ts         # CLI invocation
│   │   ├── prompts.ts         # prompt templates
│   │   └── parser.ts          # response parsing
│   └── report/
│       ├── generator.ts       # markdown assembly
│       └── templates.ts       # section templates
├── app/                       # Next.js web UI (Phase 5)
├── data/                      # SQLite DB + reports
│   └── reports/               # generated markdown files
├── docs/
├── config.toml
├── .env                       # JIRA_EMAIL, JIRA_API_TOKEN
├── package.json
├── drizzle.config.ts
└── bunfig.toml
```

## Key Design Decisions

1. **Claude Code CLI, not API** — No API key needed. Claude Code runs with your existing subscription, directly in each repo with full file access.

2. **SQLite, not Postgres** — Single-user tool, runs locally. SQLite is zero-config and file-portable.

3. **Git CLI, not libgit2** — Bun's shell (`$`) makes git commands trivial. No native addon compilation issues.

4. **Jira REST API, not MCP** — Direct API calls are simpler and more reliable than running a Jira MCP server. We may add MCP as an option later if needed.

5. **TOML config, not env-only** — Structured config for repos, team members, and branch patterns. Secrets stay in `.env`.

6. **Drizzle ORM** — Type-safe, lightweight, perfect for SQLite with Bun.
