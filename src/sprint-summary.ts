/**
 * Sprint Summary orchestrator.
 * Loads sprint data, computes stats, invokes Claude for technical + general sections,
 * stores in DB, and generates a markdown report.
 */

import { getSprintById, getSprintTicketKeys, getSprintTickets, getSprintCommits, getTicketSummariesByKeys, getSprintMemberContributions, getSprintPRStats, storeSprintSummary } from "./db/queries";
import { findClaudeCli, invokeClaude } from "./claude/invoke";
import { buildSprintTechnicalPrompt, buildSprintGeneralPrompt } from "./claude/prompt";
import type { SprintSummaryInput } from "./claude/prompt";
import { generateSprintReport } from "./report/sprint-report";
import type { Config } from "./config";

const DONE_STATUSES = new Set(["Done", "Closed", "Resolved"]);
const IN_REVIEW_STATUSES = new Set(["In Review", "Code Review", "Review"]);
const IN_PROGRESS_STATUSES = new Set(["In Progress", "In Development", "Development"]);

export interface SprintSummaryOptions {
  sprintId: number;
  runId?: number;
  config: Config;
}

export async function generateSprintSummary(opts: SprintSummaryOptions): Promise<{
  technicalSummary: string;
  generalSummary: string;
  reportPath: string;
  statsJson: string;
}> {
  const { sprintId, runId, config } = opts;

  const sprint = await getSprintById(sprintId);
  if (!sprint) throw new Error(`Sprint #${sprintId} not found`);

  console.log(`\n=== Sprint Summary: "${sprint.name}" ===\n`);

  // Load data
  const ticketKeys = await getSprintTicketKeys(sprintId);
  const sprintTickets = await getSprintTickets(sprintId);
  const sprintCommits = await getSprintCommits(sprintId);
  const ticketSummaries = await getTicketSummariesByKeys(ticketKeys);
  const memberContributions = await getSprintMemberContributions(sprintId, config.team);
  const prStats = await getSprintPRStats(sprintId);

  // Compute ticket status breakdown
  let done = 0, inProgress = 0, inReview = 0, todo = 0;
  for (const t of sprintTickets) {
    const status = t.status ?? "";
    if (DONE_STATUSES.has(status)) done++;
    else if (IN_REVIEW_STATUSES.has(status)) inReview++;
    else if (IN_PROGRESS_STATUSES.has(status)) inProgress++;
    else todo++;
  }

  const ticketStats = { total: sprintTickets.length, done, inProgress, inReview, todo };
  const prMetrics = {
    merged: prStats.totalMerged,
    avgTimeToMergeHours: prStats.avgTimeToMergeHours,
    avgReviewRounds: prStats.avgReviewRounds,
  };

  const summaryInput: SprintSummaryInput = {
    sprintName: sprint.name,
    sprintGoal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    ticketSummaries: ticketSummaries.map((ts) => ({
      jiraKey: ts.jiraKey,
      summaryText: ts.summaryText,
      repo: ts.repo,
    })),
    memberContributions,
    ticketStats,
    prMetrics,
  };

  console.log(`  Tickets: ${ticketStats.total} (${ticketStats.done} done, ${ticketStats.inProgress} in progress, ${ticketStats.inReview} review, ${ticketStats.todo} todo)`);
  console.log(`  Commits: ${sprintCommits.length}`);
  console.log(`  Ticket summaries available: ${ticketSummaries.length}`);
  console.log();

  // Find Claude CLI
  const claudePath = await findClaudeCli();
  if (!claudePath) {
    throw new Error("Claude CLI not found. Install Claude Code to generate sprint summaries.");
  }

  // Generate technical summary
  process.stdout.write("  Generating technical summary...");
  const technicalPrompt = buildSprintTechnicalPrompt(summaryInput);
  const sessionId = crypto.randomUUID();

  const technicalResult = await invokeClaude({
    claudePath,
    prompt: technicalPrompt,
    repoPath: config.repos[0]?.path ?? process.cwd(),
    sessionId,
    timeoutMs: 180_000,
  });

  if (!technicalResult.ok) {
    throw new Error(`Technical summary failed: ${technicalResult.error}`);
  }
  console.log(" Done");

  // Generate general summary (with technical context)
  process.stdout.write("  Generating general summary...");
  const generalPrompt = buildSprintGeneralPrompt(summaryInput, technicalResult.output);

  const generalResult = await invokeClaude({
    claudePath,
    prompt: generalPrompt,
    repoPath: config.repos[0]?.path ?? process.cwd(),
    resumeSessionId: sessionId,
    timeoutMs: 180_000,
  });

  if (!generalResult.ok) {
    throw new Error(`General summary failed: ${generalResult.error}`);
  }
  console.log(" Done");

  // Generate markdown report
  const outputDir = config.general.output_dir ?? "./data/reports";
  const { filePath } = await generateSprintReport({
    sprintName: sprint.name,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    goal: sprint.goal,
    generalSummary: generalResult.output,
    technicalSummary: technicalResult.output,
    ticketStats,
    memberContributions,
    prMetrics,
    outputDir,
  });

  console.log(`  Report: ${filePath}`);

  // Store in DB
  const statsJson = JSON.stringify({ ticketStats, prMetrics, memberContributions, commitCount: sprintCommits.length });

  await storeSprintSummary({
    sprintId,
    runId,
    technicalSummary: technicalResult.output,
    generalSummary: generalResult.output,
    statsJson,
    reportPath: filePath,
    sessionId,
  });

  console.log(`  Stored in DB\n`);

  return {
    technicalSummary: technicalResult.output,
    generalSummary: generalResult.output,
    reportPath: filePath,
    statsJson,
  };
}
