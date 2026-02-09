# Claude Code Prompt Strategy

How we use Claude Code CLI to analyze team activity.

## Invocation

Claude Code is called in **print mode** (`-p`) from within each repo directory:

```bash
cd /path/to/repo
claude -p "$(cat prompt.txt)"
```

Or programmatically via Bun:

```ts
import { $ } from "bun";

const output = await $`claude -p ${prompt}`
  .cwd(repoPath)
  .text();
```

## Prompt Templates

### Per-Repo Activity Summary

Sent once per repo that has new activity. Includes all team members' changes in that repo.

```
You are analyzing recent activity in the {{repo_name}} repository.

Below are the NEW commits (not seen before) and their diffs, grouped by author.
After the commits, you'll find the Jira ticket context for any referenced tickets.

For each team member's work, provide:
1. **What they worked on** — plain English summary of the changes
2. **How they're approaching it** — implementation strategy, patterns used
3. **Key code changes** — most important files/functions modified
4. **What's likely remaining** — based on the diff + Jira ticket scope

Keep summaries concise but informative. A tech lead should understand the state
of each piece of work after reading your summary.

---

## Commits

{{#each authors}}
### {{author_name}} ({{commit_count}} commits on {{branch}})

{{#each commits}}
#### {{short_sha}} — {{message}}
```diff
{{diff}}
```
{{/each}}
{{/each}}

---

## Jira Ticket Context

{{#each tickets}}
### {{jira_key}}: {{summary}}
- **Type**: {{ticket_type}}
- **Status**: {{status}}
- **Assignee**: {{assignee}}
- **Description**: {{description}}
- **Subtasks**:
{{#each subtasks}}
  - [{{status}}] {{summary}}
{{/each}}
- **Recent comments**:
{{#each recent_comments}}
  - {{author}} ({{date}}): {{body}}
{{/each}}
{{/each}}

---

Format your response as markdown sections per team member.
```

### Ticket Deep-Dive (for new/unfamiliar tickets)

When a ticket is first seen, we ask Claude Code (while inside the repo) for a deeper analysis:

```
I need to understand Jira ticket {{jira_key}}: "{{summary}}"

The ticket description says:
{{description}}

The following branches and commits are related:
{{branches_and_commits}}

You have access to this repository. Please:
1. Read the relevant files that were changed
2. Explain what problem this ticket is solving
3. Describe the implementation approach being taken
4. Assess what percentage of the work appears complete
5. Note any potential risks or concerns you see in the code

Be specific — reference actual file names and functions.
```

### Diff-Only Summary (for large changesets)

When diffs are too large to send in full, we send stats only and let Claude Code read files:

```
The following commits were made in {{repo_name}} by {{author_name}}:

{{#each commits}}
- {{short_sha}} {{message}} ({{files_changed}} files, +{{insertions}}/-{{deletions}})
  Files: {{changed_files_list}}
{{/each}}

The diffs are too large to include directly. Please:
1. Read the key files mentioned above to understand the changes
2. Summarize what was done and why
3. Note the implementation approach

Related Jira ticket: {{jira_key}} — {{ticket_summary}}
```

## Prompt Size Management

- **Max diff lines per prompt**: Configurable (default 500 lines)
- **Fallback**: If diffs exceed limit, switch to stats-only prompt and let Claude Code read files directly
- **Splitting**: If a single repo has too many changes, split by author into separate Claude Code calls
- **Context**: Always include Jira ticket info — it's small and critical for understanding "why"

## Output Parsing

Claude Code's response is already markdown. We:
1. Capture the full stdout
2. Trim any preamble (e.g., "Here's my analysis:")
3. Inject it into the report template under the correct repo/author section
4. Store it in the `summaries` table for historical reference
