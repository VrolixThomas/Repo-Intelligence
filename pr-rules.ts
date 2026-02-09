/**
 * PR Rules Extraction CLI — fetch merged PR comments from Bitbucket,
 * generate analytics report, and invoke Claude to extract coding rules
 * into CLAUDE.md files.
 *
 * Usage:
 *   bun run pr-rules.ts                        # default: last 1 year, portal repo
 *   bun run pr-rules.ts --repo providerservice # target a different repo from config.toml
 *   bun run pr-rules.ts --since 2025-06-01     # custom start date
 *   bun run pr-rules.ts --dry-run              # show grouping + analytics, skip Claude
 *   bun run pr-rules.ts --verbose              # detailed progress
 *   bun run pr-rules.ts --limit 50             # cap to N most recent merged PRs
 *   bun run pr-rules.ts --analytics-only       # skip rule extraction, only analytics
 */

import { loadConfig } from "./src/config";
import { getBitbucketConfig } from "./src/bitbucket/client";
import { fetchMergedPRs } from "./src/bitbucket/merged-prs";
import { fetchAllPRComments } from "./src/bitbucket/comments";
import type { PRCommentBundle } from "./src/bitbucket/comments";
import { buildClaudeMdIndex, mapFileToClaudeMd } from "./src/prrules/mapper";
import type { ClaudeMdTarget, ClaudeMdIndex } from "./src/prrules/mapper";
import { buildRuleExtractionPrompt } from "./src/prrules/prompt";
import { computeReviewAnalytics, type ClaudeMdGroup } from "./src/prrules/analytics";
import { generateAnalyticsReport } from "./src/prrules/report";
import { findClaudeCli, invokeClaude } from "./src/claude/invoke";

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const sinceDate = getArg("--since");
const limitStr = getArg("--limit");
const repoName = getArg("--repo") ?? "portal";
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const analyticsOnly = args.includes("--analytics-only");

async function main() {
  console.log("=== PR Rules Extraction ===\n");

  // 1. Load config + Bitbucket credentials
  const config = loadConfig();
  const bbConfig = getBitbucketConfig(config);
  if (!bbConfig) {
    console.error("No Bitbucket credentials configured. Set BITBUCKET_EMAIL + BITBUCKET_API_TOKEN (or JIRA_*)");
    process.exit(1);
  }

  // Find target repo
  const repo = config.repos.find(r => r.name === repoName);
  if (!repo) {
    const available = config.repos.map(r => r.name).join(", ");
    console.error(`No '${repoName}' repo found in config.toml. Available: ${available}`);
    process.exit(1);
  }

  // Derive repo slug from config (repo name in Bitbucket)
  const repoSlug = repo.name;

  // Date range: default last 1 year
  const since = sinceDate ?? getOneYearAgo();
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  console.log(`Repo: ${repo.name} (${repo.path})`);
  console.log(`Date range: since ${since}`);
  if (limit) console.log(`PR limit: ${limit}`);
  if (dryRun) console.log("Mode: DRY RUN (no Claude invocations)");
  if (analyticsOnly) console.log("Mode: ANALYTICS ONLY");
  console.log();

  // 2. Fetch merged PRs
  console.log("Fetching merged PRs from Bitbucket...");
  const prs = await fetchMergedPRs(bbConfig, repoSlug, since, { limit, verbose });
  console.log(`Found ${prs.length} merged PRs with comments\n`);

  if (prs.length === 0) {
    console.log("No PRs with comments found. Nothing to do.");
    return;
  }

  // 3. Fetch all comments
  const estMinutes = Math.ceil(prs.length * 0.6 / 60); // ~600ms per PR (500ms delay + API time)
  console.log(`Fetching PR comments for ${prs.length} PRs (estimated ~${estMinutes} min)...`);
  const bundles = await fetchAllPRComments(bbConfig, repoSlug, prs, { verbose });
  const totalComments = bundles.reduce((sum, b) => sum + b.comments.length, 0);
  console.log(`Collected ${totalComments} reviewer comments across ${bundles.length} PRs\n`);

  if (totalComments === 0) {
    console.log("No reviewer comments found. Nothing to do.");
    return;
  }

  // 4. Build CLAUDE.md index
  console.log("Building CLAUDE.md index...");
  const index = await buildClaudeMdIndex(repo.path);
  console.log(`Found ${index.targets.length} CLAUDE.md files\n`);

  // 5. Map comments to CLAUDE.md targets
  const claudeMdGroups = groupCommentsByClaudeMd(bundles, index);

  if (verbose) {
    console.log("Comment grouping:");
    for (const [path, group] of claudeMdGroups) {
      const commentCount = group.bundles.flatMap(b => b.comments).length;
      console.log(`  ${group.target.projectName}: ${commentCount} comments (${group.bundles.length} PRs)`);
    }
    console.log();
  }

  // 6. Generate analytics report (always runs)
  console.log("Computing analytics...");
  const analytics = computeReviewAnalytics(bundles, claudeMdGroups, index);
  const report = generateAnalyticsReport(analytics);
  const reportPath = `data/pr-review-analytics-${repo.name}.md`;
  await Bun.write(reportPath, report);
  console.log(`Analytics report written to ${reportPath}`);

  // Print key stats
  console.log();
  console.log(`  Total PRs: ${analytics.totalPRs}`);
  console.log(`  Total comments: ${analytics.totalComments} (${analytics.totalInlineComments} inline, ${analytics.totalGeneralComments} general)`);
  if (analytics.topReviewers.length > 0) {
    console.log("  Top reviewers:");
    for (const r of analytics.topReviewers.slice(0, 3)) {
      console.log(`    ${r.name}: ${r.commentCount} comments across ${r.prsReviewed} PRs`);
    }
  }
  if (analytics.commentsByProject.length > 0) {
    console.log("  Top projects:");
    for (const p of analytics.commentsByProject.slice(0, 3)) {
      console.log(`    ${p.projectName}: ${p.commentCount} comments`);
    }
  }
  console.log();

  // Stop here if analytics-only or dry-run
  if (analyticsOnly) {
    console.log("Analytics-only mode — skipping rule extraction.");
    return;
  }

  if (dryRun) {
    console.log("Dry run — skipping Claude invocations.");
    printGroupingSummary(claudeMdGroups);
    return;
  }

  // 7. Find Claude CLI
  const claudePath = await findClaudeCli();
  if (!claudePath) {
    console.error("Claude CLI not found. Install via: curl -fsSL https://claude.ai/install.sh | sh");
    process.exit(1);
  }
  console.log(`Claude CLI: ${claudePath}\n`);

  // 8. Invoke Claude for each CLAUDE.md with >= 3 comments
  const eligibleGroups = [...claudeMdGroups.entries()];

  console.log(`${eligibleGroups.length} CLAUDE.md targets to process\n`);

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < eligibleGroups.length; i++) {
    const [, group] = eligibleGroups[i]!;
    const commentCount = group.bundles.flatMap(b => b.comments).length;
    console.log(`Processing ${group.target.projectName} (${commentCount} comments)...`);

    const prompt = buildRuleExtractionPrompt({
      target: group.target,
      bundles: group.bundles,
    });

    if (verbose) {
      console.log(`  Prompt length: ${prompt.length} chars`);
    }

    const result = await invokeClaude({
      claudePath,
      prompt,
      repoPath: repo.path,
      allowedTools: ["Read", "Edit", "Write"],
      timeoutMs: 180_000,
    });

    if (result.ok) {
      console.log(`  Done (${Math.round(result.durationMs / 1000)}s)`);
      processed++;
    } else {
      console.error(`  Failed: ${result.error}`);
      failed++;
    }

    // Rate limiting between Claude invocations
    if (i < eligibleGroups.length - 1) {
      await sleep(2000);
    }
  }

  // 9. Print summary
  console.log("\n=== Summary ===");
  console.log(`  CLAUDE.md files processed: ${processed}`);
  if (failed > 0) console.log(`  Failed: ${failed}`);
  console.log(`  Analytics report: ${reportPath}`);
  console.log();
  console.log(`Review changes:`);
  console.log(`  cd ${repo.path} && git diff`);
  console.log(`  git diff --stat`);
}

// --- Helpers ---

function groupCommentsByClaudeMd(
  bundles: PRCommentBundle[],
  index: ClaudeMdIndex
): Map<string, ClaudeMdGroup> {
  const groups = new Map<string, ClaudeMdGroup>();

  for (const bundle of bundles) {
    // Track which targets this bundle contributes to (for splitting)
    const targetBundles = new Map<string, PRCommentBundle>();

    for (const comment of bundle.comments) {
      const target = mapFileToClaudeMd(comment.filePath, index);
      if (!target) continue;

      const key = target.claudeMdPath;

      // Get or create the per-target bundle for this PR
      let targetBundle = targetBundles.get(key);
      if (!targetBundle) {
        targetBundle = {
          prId: bundle.prId,
          prTitle: bundle.prTitle,
          prAuthor: bundle.prAuthor,
          prUrl: bundle.prUrl,
          comments: [],
        };
        targetBundles.set(key, targetBundle);
      }
      targetBundle.comments.push(comment);
    }

    // Merge per-target bundles into groups
    for (const [key, targetBundle] of targetBundles) {
      let group = groups.get(key);
      if (!group) {
        const target = mapFileToClaudeMd(targetBundle.comments[0]?.filePath ?? null, index);
        if (!target) continue;
        group = { target, bundles: [] };
        groups.set(key, group);
      }
      group.bundles.push(targetBundle);
    }
  }

  return groups;
}

function printGroupingSummary(groups: Map<string, ClaudeMdGroup>) {
  console.log("CLAUDE.md grouping summary:");
  const sorted = [...groups.entries()]
    .map(([path, group]) => ({
      path,
      project: group.target.projectName,
      comments: group.bundles.flatMap(b => b.comments).length,
      prs: group.bundles.length,
    }))
    .sort((a, b) => b.comments - a.comments);

  for (const g of sorted) {
    console.log(`  ${g.project}: ${g.comments} comments from ${g.prs} PRs`);
  }
}

function getOneYearAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
