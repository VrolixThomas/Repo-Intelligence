/**
 * Generate a markdown PR review analytics report.
 */

import type { ReviewAnalytics } from "./analytics";

/**
 * Generate the full analytics report as a markdown string.
 */
export function generateAnalyticsReport(analytics: ReviewAnalytics): string {
  const { dateRange } = analytics;
  const since = dateRange.since.slice(0, 10) || "unknown";
  const until = dateRange.until.slice(0, 10) || "unknown";
  const generated = new Date().toISOString().slice(0, 10);

  const uniqueAuthors = new Set(analytics.reviewerAuthorPairs.map(p => p.author));

  const lines: string[] = [];

  // Header
  lines.push("# PR Review Analytics Report");
  lines.push(`> Portal repository — ${since} to ${until}`);
  lines.push(`> Generated: ${generated}`);
  lines.push("");

  // Overview
  lines.push("## Overview");
  lines.push(`- **${analytics.totalPRs}** merged PRs analyzed, **${analytics.totalComments}** reviewer comments collected`);
  lines.push(`- **${analytics.totalInlineComments}** inline comments, **${analytics.totalGeneralComments}** general comments`);
  lines.push(`- **${analytics.topReviewers.length}** unique reviewers, **${uniqueAuthors.size}** unique PR authors`);
  lines.push("");

  // Top Reviewers
  lines.push("## Top Reviewers");
  lines.push("| Reviewer | Comments | Inline | PRs Reviewed |");
  lines.push("|----------|----------|--------|--------------|");
  for (const r of analytics.topReviewers.slice(0, 15)) {
    lines.push(`| ${r.name} | ${r.commentCount} | ${r.inlineCount} | ${r.prsReviewed} |`);
  }
  lines.push("");

  // Most-Commented Projects
  lines.push("## Most-Commented Projects");
  lines.push("| Project | Comments | Reviewers | PRs |");
  lines.push("|---------|----------|-----------|-----|");
  for (const p of analytics.commentsByProject.slice(0, 20)) {
    lines.push(`| ${p.projectName} | ${p.commentCount} | ${p.uniqueReviewers} | ${p.uniquePRs} |`);
  }
  lines.push("");

  // Hotspot Files
  if (analytics.hotspotFiles.length > 0) {
    lines.push("## Hotspot Files (Top 20)");
    lines.push("Files that consistently attract review feedback.");
    lines.push("| File | Comments | PRs | Reviewers |");
    lines.push("|------|----------|-----|-----------|");
    for (const f of analytics.hotspotFiles) {
      lines.push(`| ${f.filePath} | ${f.commentCount} | ${f.uniquePRs} | ${f.uniqueReviewers} |`);
    }
    lines.push("");
  }

  // Comment Categories
  lines.push("## Comment Categories");
  lines.push("What reviewers comment on most.");
  lines.push("| Category | Count | % | Examples |");
  lines.push("|----------|-------|---|----------|");
  for (const c of analytics.commentCategories) {
    const examplesStr = c.examples
      .map(e => `"${e.replace(/\|/g, "\\|").replace(/\n/g, " ").trim()}"`)
      .join(", ");
    lines.push(`| ${c.category} | ${c.count} | ${c.percentage}% | ${examplesStr} |`);
  }
  lines.push("");

  // Review Patterns
  if (analytics.reviewerAuthorPairs.length > 0) {
    lines.push("## Review Patterns");
    lines.push("Who reviews whom (top 15 pairs).");
    lines.push("| Reviewer | Author | Comments |");
    lines.push("|----------|--------|----------|");
    for (const p of analytics.reviewerAuthorPairs) {
      lines.push(`| ${p.reviewer} | ${p.author} | ${p.commentCount} |`);
    }
    lines.push("");
  }

  // Monthly Trend
  if (analytics.monthlyTrend.length > 0) {
    lines.push("## Monthly Trend");
    lines.push("| Month | PRs | Comments | Avg Comments/PR |");
    lines.push("|-------|-----|----------|-----------------|");
    for (const m of analytics.monthlyTrend) {
      lines.push(`| ${m.month} | ${m.prCount} | ${m.commentCount} | ${m.avgCommentsPerPR} |`);
    }
    lines.push("");
  }

  // Inline vs General by Project
  if (analytics.commentTypeSplit.length > 0) {
    lines.push("## Inline vs General by Project");
    lines.push("| Project | Inline | General |");
    lines.push("|---------|--------|---------|");
    for (const s of analytics.commentTypeSplit.slice(0, 20)) {
      lines.push(`| ${s.projectName} | ${s.inline} | ${s.general} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
