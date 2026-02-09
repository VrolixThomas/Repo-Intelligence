/**
 * Interactive follow-up CLI — resume a Claude session or start a new one
 * with previous summary context.
 *
 * Usage:
 *   bun run followup.ts PI-2589                    # follow up on a Jira ticket
 *   bun run followup.ts --member "Viktor Gakis"    # follow up on a member's work
 *   bun run followup.ts --run 8                    # follow up on a specific run's summary
 */

import { loadConfig } from "./src/config";
import { getTicketSummariesByKey, getTicketSummariesForRun, getMemberTicketSummaries } from "./src/db/queries";
import { findClaudeCli } from "./src/claude";

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const memberName = getArg("--member");
const runIdStr = getArg("--run");
const sessionId = getArg("--session");
const ticketKey = args.find((a) => !a.startsWith("--") && /^[A-Z]+-\d+$/.test(a));

async function main() {
  if (!memberName && !runIdStr && !ticketKey && !sessionId) {
    console.log("Usage:");
    console.log("  bun run followup.ts PI-2589                 # follow up on a ticket");
    console.log('  bun run followup.ts --member "Viktor Gakis" # follow up on a member');
    console.log("  bun run followup.ts --run 8                 # follow up on a run");
    console.log("  bun run followup.ts --session <uuid>        # resume a Claude session directly");
    process.exit(1);
  }

  const claudePath = await findClaudeCli();
  if (!claudePath) {
    console.error("Claude CLI not found. Install Claude Code to use follow-ups.");
    process.exit(1);
  }

  let config;
  try {
    config = loadConfig();
  } catch (err: any) {
    console.error(`Failed to load config.toml: ${err.message}`);
    process.exit(1);
  }

  // Direct session resume — skip summary lookup entirely
  if (sessionId) {
    const defaultRepo = config.repos[0];
    const cwd = defaultRepo?.path ?? process.cwd();
    console.log(`Resuming session ${sessionId}...\n`);
    const proc = Bun.spawn([claudePath, "--resume", sessionId], {
      cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        PATH: `/Users/Werk/.bun/bin:${process.env.PATH ?? ""}`,
      },
    });
    await proc.exited;
    return;
  }

  // Find the relevant ticket summary
  type TicketSummaryRow = ReturnType<typeof getTicketSummariesByKey>[number];
  let summary: TicketSummaryRow | undefined;
  let repoPath: string | undefined;

  if (runIdStr) {
    // Get summaries from a specific run
    const runId = parseInt(runIdStr, 10);
    const runSummaries = await getTicketSummariesForRun(runId);
    if (runSummaries.length === 0) {
      console.error(`No summaries found for run #${runId}`);
      process.exit(1);
    }

    if (ticketKey) {
      summary = runSummaries.find((s) => s.jiraKey === ticketKey);
    } else if (runSummaries.length === 1) {
      summary = runSummaries[0];
    } else {
      console.log(`Run #${runId} has ${runSummaries.length} ticket summaries:\n`);
      for (const s of runSummaries) {
        console.log(`  ${s.id}. ${s.jiraKey} in ${s.repo ?? "?"} (${s.createdAt})`);
      }
      console.log("\nRe-run with a specific ticket key to select one.");
      process.exit(0);
    }
  } else if (ticketKey) {
    // Direct ticket lookup — O(1) via index
    const summaries = await getTicketSummariesByKey(ticketKey);
    if (summaries.length === 0) {
      console.error(`No summary found for ticket ${ticketKey}.`);
      process.exit(1);
    }
    // Pick most recent
    summary = summaries[0];
  } else if (memberName) {
    // Find by member name — get their recent ticket summaries
    const member = config.team.find((t) => t.name.toLowerCase() === memberName.toLowerCase());
    if (!member) {
      console.error(`Team member "${memberName}" not found in config. Available:`);
      for (const t of config.team) console.error(`  - ${t.name}`);
      process.exit(1);
    }

    const memberSummaries = await getMemberTicketSummaries(member.emails, 5);
    if (memberSummaries.length === 0) {
      console.error(`No summaries found for member "${memberName}".`);
      process.exit(1);
    }

    if (memberSummaries.length === 1) {
      summary = memberSummaries[0];
    } else {
      console.log(`Found ${memberSummaries.length} recent ticket summaries for ${memberName}:\n`);
      for (const s of memberSummaries) {
        console.log(`  ${s.jiraKey} in ${s.repo ?? "?"} (${s.createdAt})`);
      }
      console.log("\nRe-run with a specific ticket key to select one.");
      process.exit(0);
    }
  }

  if (!summary) {
    console.error("No matching summary found.");
    if (ticketKey) console.error(`No summary references ticket ${ticketKey}.`);
    if (memberName) console.error(`No summary found for member "${memberName}".`);
    process.exit(1);
  }

  // Resolve repo path
  if (!repoPath) {
    const repo = config.repos.find((r) => r.name === summary!.repo);
    repoPath = repo?.path ?? process.cwd();
  }

  console.log(`Found summary for ${summary.jiraKey} in ${summary.repo ?? "?"} (${summary.createdAt})\n`);

  // Approach A: Try session resumption
  if (summary.sessionId) {
    console.log(`Resuming session ${summary.sessionId}...\n`);
    const proc = Bun.spawn([claudePath, "--resume", summary.sessionId], {
      cwd: repoPath,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        PATH: `/Users/Werk/.bun/bin:${process.env.PATH ?? ""}`,
      },
    });

    const exitCode = await proc.exited;
    if (exitCode === 0) return;

    console.log("\nSession resume failed, falling back to new session with context...\n");
  }

  // Approach B: New session with previous summary as system prompt context
  const systemPrompt = `You are helping a tech lead follow up on a previous ticket analysis.

Previous analysis for ${summary.jiraKey} in ${summary.repo ?? "?"}:
${summary.summaryText}

Ticket: ${summary.jiraKey}
Commits analyzed: ${summary.commitShas ?? "[]"}
Authors: ${summary.authorEmails ?? "unknown"}
Branches: ${summary.branchNames ?? "[]"}

The user wants to ask follow-up questions about this ticket's activity. You have access to the repository files.`;

  console.log("Starting interactive session with previous analysis context...\n");

  const proc = Bun.spawn(
    [
      claudePath,
      "--system-prompt", systemPrompt,
      "--allowedTools", "Read,Grep,Glob",
    ],
    {
      cwd: repoPath,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        PATH: `/Users/Werk/.bun/bin:${process.env.PATH ?? ""}`,
      },
    }
  );

  await proc.exited;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
