# Tech Stack

## Runtime & Language

| Tool | Why |
|------|-----|
| **Bun** | Fast TS runtime, built-in shell API (`$`), native SQLite driver, no bundler config needed |
| **TypeScript** | Type safety for config parsing, DB schema, and API responses |

## Framework

| Tool | Why |
|------|-----|
| **Next.js 14+** (App Router) | Optional web UI for browsing reports. Only used in Phase 5. The CLI pipeline runs standalone without it. |

## Database

| Tool | Why |
|------|-----|
| **SQLite** (via `bun:sqlite`) | Zero-config, file-based, local-only tool. No server to manage. |
| **Drizzle ORM** | Lightweight, type-safe, first-class SQLite + Bun support |

## External Services

| Service | Integration |
|---------|-------------|
| **Jira Cloud** | REST API v3. Auth: email + API token (Basic Auth). |
| **Git** | CLI via `Bun.$` shell. No library dependency. |
| **Claude Code** | CLI invocation: `claude -p "prompt"` run from within each repo directory. |

## Dependencies (minimal)

```
# Core
drizzle-orm          # DB ORM
drizzle-kit          # DB migrations
@iarna/toml          # Config parsing (or smol-toml for Bun)

# Dev
@types/bun           # Bun type definitions
typescript
```

No heavy frameworks. No ORMs with migration engines. No SDK wrappers around simple REST APIs.

## Config Format

TOML for readability:

```toml
[general]
output_dir = "./data/reports"
timezone = "Europe/Amsterdam"

[[repos]]
name = "frontend"
path = "/Users/me/code/frontend"

[[repos]]
name = "backend"
path = "/Users/me/code/backend"

[[repos]]
name = "infra"
path = "/Users/me/code/infra"

[[team]]
name = "Alice"
emails = ["alice@company.com"]

[[team]]
name = "Bob"
emails = ["bob@company.com", "bob.personal@gmail.com"]

[jira]
base_url = "https://yourcompany.atlassian.net"
project_keys = ["PROJ", "INFRA"]

[claude]
# Max tokens to send in a single prompt (to avoid overwhelming context)
max_diff_lines = 500
# Whether to include full file contents for changed files
include_file_context = false
```

## Environment Variables

```env
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=your-jira-api-token
```

## How Claude Code Is Used

Claude Code is invoked as a subprocess, not via API:

```bash
# From within a repo directory, pipe a prompt
claude -p "Given these commits and their diffs from the last 24 hours,
and the following Jira ticket context, provide a summary of:
1. What was worked on and why
2. How the implementation approaches the problem
3. What remains to be done

Commits:
$(git log --oneline --since='24 hours ago')

Diffs:
$(git diff HEAD~5..HEAD --stat)

Jira tickets:
[ticket data here]"
```

This means:
- **No API key needed** — uses your existing Claude Code subscription
- **Full repo access** — Claude Code can read any file in the repo for context
- **No MCP setup required** — git access is native, Jira data is piped in
- **Runs locally** — all data stays on your machine
