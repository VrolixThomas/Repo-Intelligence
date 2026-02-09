/**
 * Sprint Summary markdown report generator.
 */

import { mkdirSync } from "fs";
import { resolve } from "path";

export interface SprintReportInput {
  sprintName: string;
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
  generalSummary: string;
  technicalSummary: string;
  ticketStats: { total: number; done: number; inProgress: number; inReview: number; todo: number };
  memberContributions: { name: string; commitCount: number; ticketCount: number; prsMerged: number }[];
  prMetrics: { merged: number; avgTimeToMergeHours: number; avgReviewRounds: number };
  outputDir: string;
}

export async function generateSprintReport(input: SprintReportInput): Promise<{ filePath: string; markdown: string }> {
  const lines: string[] = [];

  lines.push(`# Sprint Summary: ${input.sprintName}`);
  lines.push(`**${input.startDate ?? "?"} — ${input.endDate ?? "?"}**`);
  lines.push("");

  if (input.goal) {
    lines.push("## Sprint Goal");
    lines.push(input.goal);
    lines.push("");
  }

  lines.push("## Executive Summary");
  lines.push(input.generalSummary);
  lines.push("");

  lines.push("## Sprint Statistics");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total Tickets | ${input.ticketStats.total} |`);
  lines.push(`| Completed | ${input.ticketStats.done} |`);
  lines.push(`| In Progress | ${input.ticketStats.inProgress} |`);
  lines.push(`| In Review | ${input.ticketStats.inReview} |`);
  lines.push(`| Not Started | ${input.ticketStats.todo} |`);
  lines.push("");

  const activeMembers = input.memberContributions.filter((m) => m.commitCount > 0 || m.ticketCount > 0);
  if (activeMembers.length > 0) {
    lines.push("## Team Contributions");
    lines.push("");
    lines.push("| Member | Commits | Tickets | PRs Merged |");
    lines.push("|--------|---------|---------|------------|");
    for (const m of activeMembers) {
      lines.push(`| ${m.name} | ${m.commitCount} | ${m.ticketCount} | ${m.prsMerged} |`);
    }
    lines.push("");
  }

  lines.push("## Technical Summary");
  lines.push(input.technicalSummary);
  lines.push("");

  lines.push("## PR Metrics");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| PRs Merged | ${input.prMetrics.merged} |`);
  lines.push(`| Avg Time to Merge | ${input.prMetrics.avgTimeToMergeHours}h |`);
  lines.push(`| Avg Review Rounds | ${input.prMetrics.avgReviewRounds} |`);
  lines.push("");

  const markdown = lines.join("\n");

  // Write to file
  const resolvedDir = resolve(input.outputDir);
  mkdirSync(resolvedDir, { recursive: true });

  const safeName = input.sprintName.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").toLowerCase();
  const fileName = `sprint-${safeName}.md`;
  const filePath = resolve(resolvedDir, fileName);
  await Bun.write(filePath, markdown);

  return { filePath, markdown };
}
