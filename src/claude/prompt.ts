/**
 * Prompt template builder for Claude Code activity summaries.
 *
 * Builds structured prompts with pre-gathered data (commits, branches, tickets, diffs)
 * so Claude can generate rich summaries without wasting tool calls on data we already have.
 */

import type { CommitInfo, BranchInfo } from "../git/scanner";
import type { CommitDiff } from "../git/diff";
import type { BranchDiffContext } from "../git/branch-context";

export interface TicketContext {
  jiraKey: string;
  summary: string | null;
  description: string | null;
  status: string | null;
  assignee: string | null;
  priority: string | null;
  ticketType: string | null;
  commentsJson: string | null;
}

export interface PromptInput {
  repoName: string;
  memberName: string;
  commits: CommitInfo[];
  branches: BranchInfo[];
  tickets: TicketContext[];
  diffs?: CommitDiff[];
  branchDiffs?: BranchDiffContext[];
  checkedOutBranch?: string;
  previousSummary?: {
    text: string;
    createdAt: string;
    commitShas: string[];
  };
}

const MAX_PROMPT_CHARS = 50_000;
const MAX_DESCRIPTION_CHARS = 500;

export function formatCommit(c: CommitInfo, diff?: CommitDiff): string {
  const lines: string[] = [];
  lines.push(`### ${c.shortSha} — ${c.message.split("\n")[0]}`);
  lines.push(`- Branch: ${c.branch}`);
  lines.push(`- Date: ${c.date}`);
  lines.push(`- Stats: ${c.filesChanged} files, +${c.insertions}/-${c.deletions}`);
  if (c.diffStat) {
    lines.push(`- Diff stat:\n\`\`\`\n${c.diffStat}\n\`\`\``);
  }
  if (diff && diff.diff) {
    lines.push(`- Diff:\n\`\`\`diff\n${diff.diff}\n\`\`\``);
  }
  return lines.join("\n");
}

export function formatTicket(t: TicketContext): string {
  const lines: string[] = [];
  lines.push(`### ${t.jiraKey}: ${t.summary ?? "(no summary)"}`);
  lines.push(`- Type: ${t.ticketType ?? "?"} | Status: ${t.status ?? "?"} | Priority: ${t.priority ?? "?"}`);
  if (t.assignee) lines.push(`- Assignee: ${t.assignee}`);
  if (t.description) {
    const desc = t.description.length > MAX_DESCRIPTION_CHARS
      ? t.description.slice(0, MAX_DESCRIPTION_CHARS) + "..."
      : t.description;
    lines.push(`- Description: ${desc}`);
  }
  if (t.commentsJson) {
    try {
      const comments = JSON.parse(t.commentsJson) as { author: string; date: string; body: string }[];
      if (comments.length > 0) {
        lines.push("- Recent comments:");
        for (const c of comments.slice(-3)) {
          const body = c.body.length > 200 ? c.body.slice(0, 200) + "..." : c.body;
          lines.push(`  - ${c.author} (${c.date?.split("T")[0] ?? "?"}): ${body}`);
        }
      }
    } catch { /* ignore parse errors */ }
  }
  return lines.join("\n");
}

export function formatBranchDiff(bd: BranchDiffContext): string {
  const lines: string[] = [];
  const sourceLabel = bd.baseSource === "pr" ? "from PR" : bd.baseSource === "fallback" ? "fallback" : "unknown";
  lines.push(`### ${bd.branchName} vs ${bd.baseBranch} (source: ${sourceLabel})`);
  if (bd.aggregateStat) {
    lines.push(`\`\`\`\n${bd.aggregateStat.trim()}\n\`\`\``);
  }
  if (bd.aggregateDiff) {
    lines.push(`\`\`\`diff\n${bd.aggregateDiff}\n\`\`\``);
    if (bd.aggregateDiffTruncated) {
      lines.push("> Aggregate diff was truncated. Use Read/Grep to examine specific files.");
    }
  }
  return lines.join("\n");
}

// ── Ticket-centric prompt ────────────────────────────────────────────────────

export interface TicketPromptBranch {
  branchName: string;
  prInfo?: { prId: number; prState: string; prTargetBranch: string; prApprovals: number } | null;
  commits: CommitInfo[];
  authorEmails: string[];
}

export interface TicketPromptInput {
  jiraKey: string;
  repoName: string;
  ticket?: TicketContext | null;
  branches: TicketPromptBranch[];
  diffs?: CommitDiff[];
  branchDiffs?: BranchDiffContext[];
  checkedOutBranch?: string;
  previousSummary?: {
    text: string;
    createdAt: string;
    commitShas: string[];
  };
}

export function buildTicketPrompt(input: TicketPromptInput): string {
  const { jiraKey, repoName, ticket, branches: ticketBranches, diffs, branchDiffs, checkedOutBranch, previousSummary } = input;

  // Collect all commits across branches
  const allCommits = ticketBranches.flatMap((b) => b.commits);

  // Determine incremental state
  let newCommits = allCommits;
  let isIncremental = false;
  if (previousSummary && previousSummary.commitShas.length > 0) {
    const previousShaSet = new Set(previousSummary.commitShas);
    newCommits = allCommits.filter((c) => !previousShaSet.has(c.sha));
    if (newCommits.length < allCommits.length) {
      isIncremental = true;
    }
  }

  const parts: string[] = [];
  const isOrphan = jiraKey.startsWith("branch:");

  // System instructions
  if (isOrphan) {
    const branchName = jiraKey.replace("branch:", "");
    parts.push(`You are analyzing recent git activity on branch \`${branchName}\` in the "${repoName}" repository. These commits are not associated with any Jira ticket.

Your task: write a concise activity summary for a tech lead audience.

Provide:
1. **What was done** — concrete changes on this branch
2. **Who contributed** — attribution by author
3. **Key technical changes** — files/functions modified
4. **Assessment** — what this branch appears to accomplish

You have access to this repository's files. If a commit message or diff is unclear, use the Read or Grep tools to examine the actual code.

Be concise. Use markdown. Don't repeat raw commit data back.`);
  } else {
    parts.push(`You are analyzing git activity for Jira ticket ${jiraKey} in the "${repoName}" repository.

Your task: write a concise ticket-focused summary for a tech lead audience.

Provide:
1. **What was done** — concrete changes for this ticket
2. **Who contributed what** — attribution by author
3. **Key technical changes** — files/functions modified
4. **Status assessment** — what's done vs likely remaining

You have access to this repository's files. If a commit message or diff is unclear, use the Read or Grep tools to examine the actual code.

Be concise. Use markdown. Don't repeat raw commit data back.`);
  }

  // Ticket context (only for real Jira tickets)
  if (ticket && !isOrphan) {
    parts.push(`---
## Ticket Context

${formatTicket(ticket)}`);
  }

  // Previous summary for incremental analysis
  if (isIncremental && previousSummary) {
    parts.push(`---
## Previous Analysis (from ${previousSummary.createdAt.split("T")[0]})

${previousSummary.text}

---
## New Activity Since Last Analysis (${newCommits.length} new commits, ${allCommits.length - newCommits.length} already analyzed)

Update your previous analysis with the new commits below. Focus on what's changed since the last analysis.`);
  }

  // Build diffs lookup
  const diffMap = new Map<string, CommitDiff>();
  if (diffs) {
    for (const d of diffs) diffMap.set(d.sha, d);
  }

  // Per-branch commit sections
  const commitsToShow = isIncremental ? new Set(newCommits.map((c) => c.sha)) : null;

  for (const tb of ticketBranches) {
    const branchCommits = commitsToShow
      ? tb.commits.filter((c) => commitsToShow.has(c.sha))
      : tb.commits;
    if (branchCommits.length === 0) continue;

    const authors = [...new Set(branchCommits.map((c) => c.authorName))].join(", ");
    let branchHeader = `### Branch: ${tb.branchName}`;
    if (tb.prInfo) {
      branchHeader += `\nPR: #${tb.prInfo.prId} (${tb.prInfo.prState}) -> ${tb.prInfo.prTargetBranch} | ${tb.prInfo.prApprovals} approval(s)`;
    } else {
      branchHeader += "\nNo PR";
    }
    branchHeader += `\nContributor(s): ${authors}`;

    const commitLines = branchCommits.map((c) => {
      const diff = diffMap.get(c.sha);
      return formatCommit(c, diff);
    });

    parts.push(`---
${branchHeader}

${commitLines.join("\n\n")}`);
  }

  // Aggregate branch diffs section
  const activeBranchDiffs = branchDiffs?.filter((bd) => bd.baseBranch && bd.aggregateDiff) ?? [];
  if (activeBranchDiffs.length > 0) {
    parts.push(`---
## Aggregate Branch Diffs`);
    for (const bd of activeBranchDiffs) {
      parts.push(formatBranchDiff(bd));
    }
  }

  // Checked-out branch note
  if (checkedOutBranch) {
    parts.push(`---
> **Note**: You are currently on branch \`${checkedOutBranch}\`. Files you read reflect this branch's code.`);
  }

  let prompt = parts.join("\n\n");

  // Size guard: stage 1 — drop per-commit diffs first
  if (prompt.length > MAX_PROMPT_CHARS && diffs && diffs.length > 0) {
    prompt = buildTicketPrompt({ ...input, diffs: undefined });
    prompt += "\n\n> Note: Per-commit diffs omitted for size. Use the Read tool to examine changed files if needed.";
  }

  // Size guard: stage 2 — drop aggregate branch diffs if still too large
  if (prompt.length > MAX_PROMPT_CHARS && branchDiffs && branchDiffs.length > 0) {
    prompt = buildTicketPrompt({ ...input, diffs: undefined, branchDiffs: undefined });
    prompt += "\n\n> Note: All diffs omitted for size. Use the Read tool to examine changed files if needed.";
  }

  return prompt;
}

// ── Sprint Summary Prompts ────────────────────────────────────────────────────

export interface SprintSummaryInput {
  sprintName: string;
  sprintGoal: string | null;
  startDate: string | null;
  endDate: string | null;
  ticketSummaries: { jiraKey: string; summaryText: string; repo: string | null }[];
  memberContributions: { name: string; commitCount: number; ticketCount: number; prsMerged: number }[];
  ticketStats: { total: number; done: number; inProgress: number; inReview: number; todo: number };
  prMetrics: { merged: number; avgTimeToMergeHours: number; avgReviewRounds: number };
}

export function buildSprintTechnicalPrompt(input: SprintSummaryInput): string {
  const parts: string[] = [];

  parts.push(`You are writing a technical sprint summary for "${input.sprintName}" (${input.startDate ?? "?"} to ${input.endDate ?? "?"}).

Your audience: engineering team and tech leads.

Write a concise technical narrative (500-800 words) organized BY FEATURE AREA, not by ticket:
1. **Key Features & Changes** — what was built, grouped by area/theme
2. **Architecture & Design Decisions** — notable patterns, refactors, tech debt addressed
3. **Technical Highlights** — interesting implementation details
4. **Remaining Work** — what's still in progress or deferred

Do NOT list tickets one-by-one. Synthesize across tickets into a coherent narrative.
Use markdown.`);

  if (input.sprintGoal) {
    parts.push(`---
## Sprint Goal
${input.sprintGoal}`);
  }

  parts.push(`---
## Sprint Stats
- Tickets: ${input.ticketStats.total} total (${input.ticketStats.done} done, ${input.ticketStats.inProgress} in progress, ${input.ticketStats.inReview} in review, ${input.ticketStats.todo} todo)
- PRs merged: ${input.prMetrics.merged} (avg ${input.prMetrics.avgTimeToMergeHours}h to merge, ${input.prMetrics.avgReviewRounds} review rounds)
`);

  // Team contributions
  const activeMembers = input.memberContributions.filter((m) => m.commitCount > 0);
  if (activeMembers.length > 0) {
    parts.push(`## Team
${activeMembers.map((m) => `- ${m.name}: ${m.commitCount} commits, ${m.ticketCount} tickets, ${m.prsMerged} PRs merged`).join("\n")}`);
  }

  // Ticket summaries (the bulk of the context)
  parts.push(`---
## Ticket Summaries (${input.ticketSummaries.length})`);

  let totalChars = parts.join("\n\n").length;
  const budgetPerSummary = Math.min(
    400,
    Math.floor((MAX_PROMPT_CHARS - totalChars - 1000) / Math.max(input.ticketSummaries.length, 1))
  );

  for (const ts of input.ticketSummaries) {
    const text = ts.summaryText.length > budgetPerSummary
      ? ts.summaryText.slice(0, budgetPerSummary) + "..."
      : ts.summaryText;
    parts.push(`### ${ts.jiraKey}${ts.repo ? ` (${ts.repo})` : ""}
${text}`);
  }

  return parts.join("\n\n");
}

export function buildSprintGeneralPrompt(input: SprintSummaryInput, technicalSummary: string): string {
  const parts: string[] = [];

  parts.push(`You are writing a stakeholder-friendly sprint summary for "${input.sprintName}" (${input.startDate ?? "?"} to ${input.endDate ?? "?"}).

Your audience: product managers, stakeholders, non-technical readers.

Write a clear, concise summary (300-500 words):
1. **Sprint Overview** — what was accomplished in plain language
2. **Key Deliverables** — the most important things shipped, in business terms
3. **Progress vs Goal** — how well the sprint goal was met
4. **Risks & Concerns** — anything the stakeholder should know about

Do NOT use technical jargon. Frame everything in terms of user/business value.
Use markdown.`);

  if (input.sprintGoal) {
    parts.push(`---
## Sprint Goal
${input.sprintGoal}`);
  }

  parts.push(`---
## Stats
- ${input.ticketStats.done} of ${input.ticketStats.total} tickets completed
- ${input.ticketStats.inProgress + input.ticketStats.inReview} still in progress
- ${input.prMetrics.merged} code changes merged`);

  // Include technical summary as context (truncated if needed)
  const techBudget = Math.min(technicalSummary.length, 3000);
  parts.push(`---
## Technical Summary (for context)
${technicalSummary.slice(0, techBudget)}${technicalSummary.length > techBudget ? "\n..." : ""}`);

  return parts.join("\n\n");
}

export function buildPrompt(input: PromptInput): string {
  const { repoName, memberName, commits, branches, tickets, diffs, branchDiffs, checkedOutBranch, previousSummary } = input;

  // Determine if this is an incremental update
  let newCommits = commits;
  let isIncremental = false;
  if (previousSummary && previousSummary.commitShas.length > 0) {
    const previousShaSet = new Set(previousSummary.commitShas);
    newCommits = commits.filter((c) => !previousShaSet.has(c.sha));
    if (newCommits.length < commits.length) {
      isIncremental = true;
    }
  }

  const parts: string[] = [];

  // System instructions
  parts.push(`You are analyzing recent git activity in the "${repoName}" repository for team member ${memberName}.

Your task: write a concise activity summary for a tech lead audience.

Provide:
1. **What they worked on** — plain English summary of their activity
2. **Key changes** — most important files/functions modified
3. **Technical approach** — patterns, decisions, notable implementation details
4. **Status** — what's done vs likely remaining (based on commits + Jira status)

You have access to this repository's files. If a commit message or diff is unclear, use the Read or Grep tools to examine the actual code for better understanding.

Be concise. Use markdown. Don't repeat raw commit data back.`);

  // Previous summary for incremental analysis
  if (isIncremental && previousSummary) {
    parts.push(`---
## Previous Analysis (from ${previousSummary.createdAt.split("T")[0]})

${previousSummary.text}

---
## New Commits Since Last Analysis (${newCommits.length} new, ${commits.length - newCommits.length} already analyzed)

Update your previous analysis with the new commits below. Focus on what's changed since the last analysis.`);
  }

  // Commits section
  const commitsToShow = isIncremental ? newCommits : commits;
  parts.push(`---
## Commits (${commitsToShow.length} total${isIncremental ? ", new only" : ""})`);

  // Build diffs lookup
  const diffMap = new Map<string, CommitDiff>();
  if (diffs) {
    for (const d of diffs) {
      diffMap.set(d.sha, d);
    }
  }

  for (const c of commitsToShow) {
    parts.push(formatCommit(c, diffMap.get(c.sha)));
  }

  // Branches section
  if (branches.length > 0) {
    parts.push(`---
## Active Branches (${branches.length})`);
    for (const b of branches) {
      const jiraMatch = b.name.match(/([A-Z][A-Z0-9]+-(?!0+\b)\d+)/);
      const jira = jiraMatch?.[1] ? ` (Jira: ${jiraMatch[1]})` : "";
      parts.push(`- ${b.name}${jira}`);
    }
  }

  // Aggregate branch diffs section
  const activeBranchDiffs = branchDiffs?.filter((bd) => bd.baseBranch && bd.aggregateDiff) ?? [];
  if (activeBranchDiffs.length > 0) {
    parts.push(`---
## Aggregate Branch Diffs`);
    for (const bd of activeBranchDiffs) {
      parts.push(formatBranchDiff(bd));
    }
  }

  // Checked-out branch note
  if (checkedOutBranch) {
    parts.push(`---
> **Note**: You are currently on branch \`${checkedOutBranch}\`. Files you read reflect this branch's code.`);
  }

  // Tickets section
  if (tickets.length > 0) {
    parts.push(`---
## Jira Ticket Context`);
    for (const t of tickets) {
      parts.push(formatTicket(t));
    }
  }

  let prompt = parts.join("\n\n");

  // Size guard: stage 1 — drop per-commit diffs first
  if (prompt.length > MAX_PROMPT_CHARS && diffs && diffs.length > 0) {
    const inputWithoutDiffs = { ...input, diffs: undefined };
    prompt = buildPrompt(inputWithoutDiffs);
    prompt += "\n\n> Note: Per-commit diffs omitted for size. Use the Read tool to examine changed files if needed.";
  }

  // Size guard: stage 2 — drop aggregate branch diffs if still too large
  if (prompt.length > MAX_PROMPT_CHARS && branchDiffs && branchDiffs.length > 0) {
    const inputWithoutBranchDiffs = { ...input, diffs: undefined, branchDiffs: undefined };
    prompt = buildPrompt(inputWithoutBranchDiffs);
    prompt += "\n\n> Note: All diffs omitted for size. Use the Read tool to examine changed files if needed.";
  }

  return prompt;
}
