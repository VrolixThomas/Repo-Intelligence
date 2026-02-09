/**
 * CLI test script for the git scanner.
 *
 * Usage:
 *   bun run scan.ts                     # scan all repos in config.toml (last 24h), with DB tracking
 *   bun run scan.ts --since 2024-01-01  # scan since a specific date
 *   bun run scan.ts --no-db             # scan without DB tracking (ad-hoc mode)
 *   bun run scan.ts --no-summary        # scan + DB but skip Claude summarization
 *   bun run scan.ts --repo /path/to/repo --name my-repo  # scan a single repo (no config, no DB)
 */

import { loadConfig } from "./src/config";
import { scanRepo, scanAllRepos } from "./src/git/scanner";
import { groupByTeamMember } from "./src/git/author";
import { getCommitDiff, getCommitDiffs } from "./src/git/diff";
import { fetchLatest, resolveBaseBranch, getAggregateBranchDiff, recordRepoState, checkoutBranch, restoreRepoState } from "./src/git/branch-context";
import type { BranchDiffContext } from "./src/git/branch-context";
import { startRun, completeRun, storeCommits, updateBranches, updateBranchPR, getLastRun, getTotalCommitCount, getStaleTicketKeys, upsertTickets, getTicketsByKeys, storeTicketSummary, getTicketSummariesForRun, getLatestTicketSummary, setRunReportPath, upsertSprints, upsertSprintTickets, getSprintByJiraId, getAllSprints, getActiveSprint, upsertPullRequests, getStaleActivityPRs, storePRActivities, computeAndCachePRMetrics } from "./src/db/queries";
import { getBranchesWithCommits } from "./src/db/queries";
import { generateReport } from "./src/report";
import { getJiraConfig, fetchTickets, filterAllowedKeys } from "./src/jira";
import { fetchBoardId, fetchSprints, fetchSprintIssueKeys } from "./src/jira/sprints";
import { findClaudeCli, invokeClaude, buildTicketPrompt, type TicketContext, type TicketPromptBranch } from "./src/claude";
import { getBitbucketConfig, fetchRepoPullRequests, fetchPRActivity } from "./src/bitbucket";

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const sinceDate = getArg("--since");
const untilDate = getArg("--until");
const singleRepoPath = getArg("--repo");
const singleRepoName = getArg("--name") ?? "test-repo";
const showDiffs = args.includes("--diffs");
const noDb = args.includes("--no-db");
const noSummary = args.includes("--no-summary");
const cronMode = args.includes("--cron");
const cronHour = Number(getArg("--cron-hour") ?? "9");
const cronMinute = Number(getArg("--cron-minute") ?? "0");
const sprintSummaryMode = args.includes("--sprint-summary");
const sprintSummaryId = getArg("--sprint-id") ? Number(getArg("--sprint-id")) : undefined;

// Populated by main() during sprint sync — tracks sprints that moved active->closed
const lastClosedSprintIds: number[] = [];

async function main() {
  console.log("=== CodingSummary Git Scanner ===\n");

  if (singleRepoPath) {
    // Ad-hoc single repo scan — always DB-free
    console.log(`Scanning single repo: ${singleRepoPath}`);
    if (sinceDate) console.log(`Since: ${sinceDate}`);
    console.log();

    const result = await scanRepo(
      { name: singleRepoName, path: singleRepoPath, default_branch: "main" },
      sinceDate
    );

    printRepoResult(result);

    if (showDiffs && result.commits.length > 0) {
      console.log("\n--- Diffs (first 3 commits) ---\n");
      for (const commit of result.commits.slice(0, 3)) {
        const diff = await getCommitDiff(singleRepoPath, commit.sha, 100);
        console.log(`\n[${commit.shortSha}] ${commit.message}`);
        console.log(diff.diff);
        if (diff.truncated) console.log("(diff was truncated)");
      }
    }

    return;
  }

  // Full scan from config
  let config;
  try {
    config = loadConfig();
  } catch (err: any) {
    console.error(`Failed to load config.toml: ${err.message}`);
    console.log("\nTip: either update config.toml with your repos, or use:\n");
    console.log("  bun run scan.ts --repo /path/to/any/git/repo\n");
    process.exit(1);
  }

  console.log(`Config loaded: ${config.repos.length} repos, ${config.team.length} team members`);
  if (sinceDate) console.log(`Since: ${sinceDate}`);
  if (untilDate) console.log(`Until: ${untilDate}`);

  const useDb = !noDb;

  if (useDb) {
    const lastRun = await getLastRun();
    if (lastRun) {
      console.log(`Last completed run: #${lastRun.id} at ${lastRun.completedAt}`);
    } else {
      console.log("No previous runs found — this will be the first run.");
    }
  } else {
    console.log("DB: disabled (--no-db)");
  }

  console.log();

  // Start a run if using DB
  let runId: number | undefined;
  if (useDb) {
    // Compute effective since/until for recording in the run
    const effectiveSince = sinceDate ?? new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
    const effectiveUntil = untilDate ?? undefined;
    runId = await startRun(effectiveSince, effectiveUntil);
    console.log(`Started run #${runId}\n`);
  }

  const results = await scanAllRepos(config.repos, sinceDate, untilDate);

  console.log("\n========== RESULTS ==========\n");

  let totalNewCommits = 0;
  let totalExisting = 0;

  for (const result of results) {
    printRepoResult(result);

    // DB integration: store commits and update branches
    if (useDb && runId !== undefined) {
      const { newCommits, existingCount } = await storeCommits(result.commits, runId);
      const branchResult = await updateBranches(result.repoName, result.branches);

      totalNewCommits += newCommits.length;
      totalExisting += existingCount;

      console.log(`  DB delta: ${newCommits.length} new, ${existingCount} already in DB`);
      console.log(`  Branches: ${branchResult.newBranches.length} new, ${branchResult.updatedBranches.length} updated, ${branchResult.goneBranches.length} gone`);
      if (branchResult.goneBranches.length > 0) {
        console.log(`    Gone: ${branchResult.goneBranches.slice(0, 5).join(", ")}${branchResult.goneBranches.length > 5 ? ` ... and ${branchResult.goneBranches.length - 5} more` : ""}`);
      }

      // Fetch Bitbucket PRs for this repo
      const bbConfig = getBitbucketConfig(config);
      if (bbConfig) {
        try {
          const { prMap, allPRs } = await fetchRepoPullRequests(bbConfig, result.repoName);
          for (const [branchName, prData] of prMap) {
            await updateBranchPR(result.repoName, branchName, prData);
          }
          console.log(`  PRs: ${prMap.size} branch matches, ${allPRs.length} total PRs`);

          // Upsert into dedicated pull_requests table
          const upserted = await upsertPullRequests(result.repoName, allPRs);
          console.log(`  PR table: ${upserted.length} upserted`);

          // Fetch activity for stale PRs
          const stalePRs = await getStaleActivityPRs(result.repoName);
          if (stalePRs.length > 0) {
            let totalActivities = 0;
            for (const stalePR of stalePRs) {
              try {
                const activities = await fetchPRActivity(bbConfig, result.repoName, stalePR.prId);
                const inserted = await storePRActivities(stalePR.id, result.repoName, stalePR.prId, activities);
                totalActivities += inserted;
                await computeAndCachePRMetrics(stalePR.id);
                await Bun.sleep(200);
              } catch (err: any) {
                console.log(`  PR Activity: error for PR #${stalePR.prId} — ${err.message?.slice(0, 80)}`);
              }
            }
            console.log(`  PR Activity: fetched for ${stalePRs.length} PRs, ${totalActivities} activities stored`);
          }
        } catch (err: any) {
          console.log(`  PRs: error fetching — ${err.message?.slice(0, 100)}`);
        }
      }

      console.log();
    }

    // Group by team member
    if (config.team.length > 0 && result.commits.length > 0) {
      const activities = groupByTeamMember(config.team, result.branches, result.commits);
      console.log("  By team member:");
      for (const activity of activities) {
        if (activity.commits.length === 0 && activity.branches.length === 0) continue;
        console.log(`    ${activity.memberName}:`);
        console.log(`      Active branches: ${activity.branches.length}`);
        console.log(`      New commits: ${activity.commits.length}`);
        for (const c of activity.commits.slice(0, 5)) {
          console.log(`        ${c.shortSha} ${c.message.split("\n")[0]}`);
        }
        if (activity.commits.length > 5) {
          console.log(`        ... and ${activity.commits.length - 5} more`);
        }
      }
      console.log();
    }
  }

  // ── Jira Ticket Enrichment ──────────────────────────────────────────────────
  if (useDb && runId !== undefined) {
    const jiraConfig = getJiraConfig(config.jira.base_url);

    if (!jiraConfig) {
      console.log("⚠ Jira: JIRA_EMAIL or JIRA_API_TOKEN not set — skipping ticket fetch\n");
    } else {
      // Collect all unique Jira keys from commits + branches
      const allJiraKeys = new Set<string>();
      for (const result of results) {
        for (const c of result.commits) {
          for (const k of c.jiraKeys) allJiraKeys.add(k);
        }
        for (const b of result.branches) {
          const jiraMatch = b.name.match(/([A-Z][A-Z0-9]+-(?!0+\b)\d+)/);
          if (jiraMatch?.[1]) allJiraKeys.add(jiraMatch[1]);
        }
      }

      if (allJiraKeys.size === 0) {
        console.log("Jira: no ticket keys found in commits/branches\n");
      } else {
        // Filter to allowed projects only (safety: only PI)
        const { allowed, skipped } = filterAllowedKeys([...allJiraKeys], config.jira.project_keys);
        if (skipped.length > 0) {
          console.log(`Jira: skipping ${skipped.length} keys from non-allowed projects: ${skipped.join(", ")}`);
        }

        if (allowed.length === 0) {
          console.log("Jira: no allowed ticket keys to fetch\n");
        } else {
          // Check which tickets need refreshing
          const staleKeys = await getStaleTicketKeys(allowed);
          console.log(`Jira: ${allowed.length} unique keys, ${staleKeys.length} need fetching`);

          if (staleKeys.length > 0) {
            const { tickets: fetchedTickets, errors } = await fetchTickets(jiraConfig, staleKeys);
            await upsertTickets(fetchedTickets);
            console.log(`Jira: fetched ${fetchedTickets.length} tickets`);
            if (errors.length > 0) {
              for (const err of errors) {
                console.log(`  ✗ ${err.key}: ${err.status} ${err.message.slice(0, 100)}`);
              }
            }
          } else {
            console.log("Jira: all tickets cached and fresh");
          }

          // Print enriched ticket context
          const cachedTickets = await getTicketsByKeys(allowed);
          if (cachedTickets.length > 0) {
            console.log("\n  Referenced tickets:");
            for (const t of cachedTickets) {
              const assignee = t.assignee ? ` (${t.assignee})` : "";
              console.log(`    ${t.jiraKey}: [${t.status}] ${t.summary}${assignee}`);
            }
          }
          console.log();
        }
      }
    }
  }

  // ── Sprint Sync ────────────────────────────────────────────────────────────
  lastClosedSprintIds.length = 0;
  if (useDb && runId !== undefined) {
    const jiraConfigForSprints = getJiraConfig(config.jira.base_url);
    if (jiraConfigForSprints) {
      const projectKey = config.jira.project_keys[0];
      if (projectKey) {
        try {
          const boardId = await fetchBoardId(jiraConfigForSprints, projectKey);
          if (boardId) {
            // Snapshot sprint states before sync (for close detection)
            const preSync = await getAllSprints();
            const preSyncStates = new Map(preSync.map((s) => [s.jiraSprintId, s.state]));

            const sprintData = await fetchSprints(jiraConfigForSprints, boardId);
            await upsertSprints(sprintData);
            console.log(`Sprints: ${sprintData.length} synced from board ${boardId}`);

            for (const s of sprintData.filter((s) => s.state !== "future")) {
              const keys = await fetchSprintIssueKeys(jiraConfigForSprints, s.jiraSprintId);
              const local = await getSprintByJiraId(s.jiraSprintId);
              if (local) {
                await upsertSprintTickets(local.id, keys);
                console.log(`  Sprint "${s.name}": ${keys.length} issues`);
              }
            }

            // Detect sprint closures (active -> closed)
            for (const s of sprintData) {
              const prevState = preSyncStates.get(s.jiraSprintId);
              if (prevState === "active" && s.state === "closed") {
                const local = await getSprintByJiraId(s.jiraSprintId);
                if (local) {
                  lastClosedSprintIds.push(local.id);
                  console.log(`  Sprint "${s.name}" closed (was active)`);
                }
              }
            }
          } else {
            console.log("Sprints: no scrum board found for project " + projectKey);
          }
        } catch (err: any) {
          console.log(`Sprints: error — ${err.message?.slice(0, 100)}`);
        }
      }
    }
    console.log();
  }

  // ── Claude Summarization (per-ticket) ──────────────────────────────────────
  if (useDb && runId !== undefined && !noSummary) {
    const claudePath = await findClaudeCli();
    if (!claudePath) {
      console.log("Claude CLI not found — skipping summary generation");
      console.log("Install Claude Code (https://claude.ai/download) to enable AI summaries\n");
    } else {
      console.log("\n========== CLAUDE SUMMARIES (per-ticket) ==========\n");

      // Step 1: Group all commits by ticket key + repo
      const ticketBundles = await groupCommitsByTicket(results);
      console.log(`  Found ${ticketBundles.size} ticket(s) across all repos\n`);

      // Step 2: Process each ticket+repo sequentially
      for (const [jiraKey, repoMap] of ticketBundles) {
        for (const [repoName, work] of repoMap) {
          const repoResult = results.find((r) => r.repoName === repoName);
          if (!repoResult) continue;

          // Check for previous summary (incremental chain, 7-day window)
          const previous = await getLatestTicketSummary(jiraKey, repoName);
          let previousSummary: { text: string; createdAt: string; commitShas: string[] } | undefined;
          if (previous) {
            const daysSince = (Date.now() - new Date(previous.createdAt).getTime()) / 86_400_000;
            if (daysSince <= 7) {
              let prevShas: string[] = [];
              try { prevShas = JSON.parse(previous.commitShas ?? "[]"); } catch { /* ignore */ }

              const prevShaSet = new Set(prevShas);
              const newCommitCount = work.commits.filter((c) => !prevShaSet.has(c.sha)).length;

              if (newCommitCount === 0) {
                console.log(`  ${jiraKey} in ${repoName}: unchanged — reusing cached summary`);
                await storeTicketSummary({
                  runId,
                  jiraKey,
                  repo: repoName,
                  commitShas: prevShas,
                  authorEmails: previous.authorEmails?.split(",") ?? [],
                  branchNames: JSON.parse(previous.branchNames ?? "[]"),
                  summaryText: previous.summaryText,
                  sessionId: previous.sessionId,
                });
                continue;
              }

              previousSummary = {
                text: previous.summaryText,
                createdAt: previous.createdAt,
                commitShas: prevShas,
              };
            }
          }

          // Fetch latest refs + record state for restoration
          console.log(`  Fetching latest for ${repoName}...`);
          await fetchLatest(repoResult.repoPath);
          const savedState = await recordRepoState(repoResult.repoPath);

          try {
            // Build per-branch commit groups with PR info
            const ticketPromptBranches: TicketPromptBranch[] = [];
            const branchDiffs: BranchDiffContext[] = [];

            for (const branchName of work.branchNames) {
              const branchCommits = work.commits.filter((c) => c.branch === branchName);
              if (branchCommits.length === 0) continue;

              // Look up PR info from DB
              const branchRow = (await getBranchesWithCommits({ repo: repoName }))
                .find((b) => b.branch.name === branchName);
              const prInfo = branchRow?.branch.prId ? {
                prId: branchRow.branch.prId,
                prState: branchRow.branch.prState ?? "OPEN",
                prTargetBranch: branchRow.branch.prTargetBranch ?? "main",
                prApprovals: branchRow.branch.prApprovals ?? 0,
              } : null;

              ticketPromptBranches.push({
                branchName,
                prInfo,
                commits: branchCommits,
                authorEmails: [...new Set(branchCommits.map((c) => c.authorEmail))],
              });

              // Get aggregate diff for this branch
              const { baseBranch, source } = await resolveBaseBranch(repoResult.repoPath, branchName);
              if (baseBranch) {
                console.log(`    Resolving base for ${branchName}: ${baseBranch} (${source})`);
                const bdContext = await getAggregateBranchDiff(
                  repoResult.repoPath,
                  branchName,
                  baseBranch,
                  config.claude.max_diff_lines
                );
                bdContext.baseSource = source;
                branchDiffs.push(bdContext);
                if (bdContext.aggregateStat) {
                  const statLines = bdContext.aggregateStat.trim().split("\n");
                  const summaryLine = statLines[statLines.length - 1]?.trim();
                  if (summaryLine) console.log(`    Aggregate diff: ${summaryLine}`);
                }
              }
            }

            // Checkout primary branch (most commits)
            let checkedOutBranch: string | undefined;
            const commitCountByBranch = new Map<string, number>();
            for (const c of work.commits) {
              commitCountByBranch.set(c.branch, (commitCountByBranch.get(c.branch) ?? 0) + 1);
            }
            const sortedBranches = [...work.branchNames].sort(
              (a, b) => (commitCountByBranch.get(b) ?? 0) - (commitCountByBranch.get(a) ?? 0)
            );
            if (sortedBranches.length > 0) {
              const primaryBranch = sortedBranches[0]!;
              const checkoutResult = await checkoutBranch(repoResult.repoPath, primaryBranch);
              if (checkoutResult.ok) {
                checkedOutBranch = primaryBranch;
                console.log(`    Checked out ${primaryBranch} (detached)`);
              }
            }

            process.stdout.write(`  Summarizing ${jiraKey} in ${repoName}...`);
            const startTime = Date.now();

            // Get ticket context from DB
            const isOrphan = jiraKey.startsWith("branch:");
            let ticketContext: TicketContext | null = null;
            if (!isOrphan) {
              const ticketRows = await getTicketsByKeys([jiraKey]);
              const t = ticketRows[0];
              if (t) {
                ticketContext = {
                  jiraKey: t.jiraKey,
                  summary: t.summary,
                  description: t.description,
                  status: t.status,
                  assignee: t.assignee,
                  priority: t.priority,
                  ticketType: t.ticketType,
                  commentsJson: t.commentsJson,
                };
              }
            }

            // Optionally fetch per-commit diffs
            let diffs;
            if (config.claude.max_diff_lines > 0) {
              diffs = await getCommitDiffs(
                repoResult.repoPath,
                work.commits.map((c) => c.sha),
                config.claude.max_diff_lines
              );
            }

            const sessionId = crypto.randomUUID();

            const prompt = buildTicketPrompt({
              jiraKey,
              repoName,
              ticket: ticketContext,
              branches: ticketPromptBranches,
              diffs,
              branchDiffs: branchDiffs.length > 0 ? branchDiffs : undefined,
              checkedOutBranch,
              previousSummary,
            });

            const claudeResult = await invokeClaude({
              claudePath,
              prompt,
              repoPath: repoResult.repoPath,
              sessionId,
            });

            const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

            if (claudeResult.ok) {
              console.log(` Done (${durationSec}s)`);

              await storeTicketSummary({
                runId,
                jiraKey,
                repo: repoName,
                commitShas: work.commits.map((c) => c.sha),
                authorEmails: [...work.authorEmails],
                branchNames: [...work.branchNames],
                summaryText: claudeResult.output,
                sessionId: claudeResult.sessionId,
              });

              console.log(`\n--- ${jiraKey} (${repoName}) ---`);
              console.log(claudeResult.output);
              console.log();
            } else {
              console.log(` Failed (${durationSec}s)`);
              console.log(`    Error: ${claudeResult.error}`);
              console.log();
            }
          } finally {
            await restoreRepoState(repoResult.repoPath, savedState);
            console.log(`  Restored ${repoName} to original state`);
          }
        }
      }
    }
  } else if (noSummary) {
    console.log("\nClaude summaries: skipped (--no-summary)\n");
  }

  // ── Report Generation ──────────────────────────────────────────────────────
  if (useDb && runId !== undefined && !noSummary) {
    const { filePath } = await generateReport({
      runId,
      config,
      repoResults: results,
      totalNewCommits,
      totalExisting,
    });
    await setRunReportPath(runId, filePath);
    console.log(`\nReport saved: ${filePath}\n`);
  }

  // Complete the run
  if (useDb && runId !== undefined) {
    await completeRun(runId, results.length, totalNewCommits);
    console.log("========== DB SUMMARY ==========");
    console.log(`Run #${runId} completed`);
    console.log(`New commits this run: ${totalNewCommits}`);
    console.log(`Already in DB: ${totalExisting}`);
    console.log(`Total commits in DB: ${await getTotalCommitCount()}`);

    // Show summary counts
    const runSummaries = await getTicketSummariesForRun(runId);
    if (runSummaries.length > 0) {
      console.log(`Ticket summaries generated: ${runSummaries.length}`);
    }
    console.log();
  }

  // Summary
  const totalCommits = results.reduce((sum, r) => sum + r.commits.length, 0);
  const totalBranches = results.reduce((sum, r) => sum + r.branches.length, 0);
  const allJiraKeys = new Set(results.flatMap((r) => r.commits.flatMap((c) => c.jiraKeys)));

  console.log("========== SCAN SUMMARY ==========");
  console.log(`Repos scanned: ${results.length}`);
  console.log(`Total branches: ${totalBranches}`);
  console.log(`Commits found: ${totalCommits}`);
  console.log(`Jira tickets referenced: ${allJiraKeys.size > 0 ? [...allJiraKeys].join(", ") : "none"}`);
}

function printRepoResult(result: import("./src/git/scanner").RepoScanResult) {
  console.log(`--- ${result.repoName} (${result.repoPath}) ---`);

  if (result.errors.length > 0) {
    console.log(`  ERRORS: ${result.errors.join("; ")}`);
  }

  console.log(`  Branches: ${result.branches.length}`);
  console.log(`  Commits found: ${result.commits.length}`);

  if (result.branches.length > 0) {
    console.log("  Recent branches:");
    for (const b of result.branches.slice(0, 10)) {
      console.log(`    ${b.name} (${b.lastCommitAuthorEmail}, ${b.lastCommitDate.split("T")[0]})`);
    }
    if (result.branches.length > 10) {
      console.log(`    ... and ${result.branches.length - 10} more`);
    }
  }

  if (result.commits.length > 0) {
    console.log("  Recent commits:");
    for (const c of result.commits.slice(0, 10)) {
      const jira = c.jiraKeys.length > 0 ? ` [${c.jiraKeys.join(", ")}]` : "";
      console.log(`    ${c.shortSha} ${c.authorName}: ${c.message.split("\n")[0]}${jira}`);
      console.log(`      ${c.branch} | ${c.filesChanged} files, +${c.insertions}/-${c.deletions}`);
    }
    if (result.commits.length > 10) {
      console.log(`    ... and ${result.commits.length - 10} more`);
    }
  }

  console.log();
}

interface TicketWorkBundle {
  commits: import("./src/git/scanner").CommitInfo[];
  branchNames: Set<string>;
  authorEmails: Set<string>;
}

/**
 * Group commits by ticket key + repo.
 * Resolution order: branch jiraKey from DB > commit jiraKeys from message.
 * Orphan commits (no ticket) grouped under `branch:{branchName}`.
 */
async function groupCommitsByTicket(
  results: import("./src/git/scanner").RepoScanResult[]
): Promise<Map<string, Map<string, TicketWorkBundle>>> {
  const bundles = new Map<string, Map<string, TicketWorkBundle>>();

  function addCommit(jiraKey: string, repoName: string, commit: import("./src/git/scanner").CommitInfo) {
    let repoMap = bundles.get(jiraKey);
    if (!repoMap) {
      repoMap = new Map();
      bundles.set(jiraKey, repoMap);
    }
    let work = repoMap.get(repoName);
    if (!work) {
      work = { commits: [], branchNames: new Set(), authorEmails: new Set() };
      repoMap.set(repoName, work);
    }
    // Avoid duplicate commits
    if (!work.commits.some((c) => c.sha === commit.sha)) {
      work.commits.push(commit);
    }
    work.branchNames.add(commit.branch);
    work.authorEmails.add(commit.authorEmail);
  }

  // Build a branch → jiraKey lookup from DB
  const branchJiraKeys = new Map<string, string>(); // "repo::branch" → jiraKey
  for (const result of results) {
    const dbBranches = await getBranchesWithCommits({ repo: result.repoName });
    for (const b of dbBranches) {
      if (b.branch.jiraKey) {
        branchJiraKeys.set(`${result.repoName}::${b.branch.name}`, b.branch.jiraKey);
      }
    }
  }

  for (const result of results) {
    for (const commit of result.commits) {
      const keys = new Set<string>();

      // Source 1: branch jiraKey from DB
      const branchKey = branchJiraKeys.get(`${result.repoName}::${commit.branch}`);
      if (branchKey) keys.add(branchKey);

      // Source 2: commit message jiraKeys
      for (const k of commit.jiraKeys) keys.add(k);

      if (keys.size === 0) {
        // Orphan: group under branch name as pseudo-key
        addCommit(`branch:${commit.branch}`, result.repoName, commit);
      } else {
        for (const key of keys) {
          addCommit(key, result.repoName, commit);
        }
      }
    }
  }

  return bundles;
}

// ── Sprint Summary (CLI or auto-trigger) ────────────────────────────────────

async function handleSprintSummary(sprintId?: number, runId?: number, cfg?: import("./src/config").Config) {
  const config = cfg ?? loadConfig();
  const { generateSprintSummary } = await import("./src/sprint-summary");
  const targetSprintId = sprintId ?? sprintSummaryId;

  if (targetSprintId) {
    await generateSprintSummary({ sprintId: targetSprintId, runId, config });
  } else {
    // Use active sprint
    const active = await getActiveSprint();
    if (!active) {
      console.log("No active sprint found for summary generation.");
      return;
    }
    await generateSprintSummary({ sprintId: active.id, runId, config });
  }
}

// ── Entry Point ──────────────────────────────────────────────────────────────

if (sprintSummaryMode && !cronMode) {
  // Standalone sprint summary mode
  handleSprintSummary().catch((err) => {
    console.error("Sprint summary error:", err);
    process.exit(1);
  });
} else if (cronMode) {
  // Cron mode
  const config = loadConfig();
  const { runCronLoop } = await import("./src/cron");
  runCronLoop({
    hour: cronHour,
    minute: cronMinute,
    timezone: config.general.timezone ?? "UTC",
    onScan: async () => {
      await main();

      // Auto-generate sprint summary for newly closed sprints
      if (lastClosedSprintIds.length > 0) {
        for (const sid of lastClosedSprintIds) {
          console.log(`\nAuto-generating sprint summary for closed sprint #${sid}...`);
          try {
            await handleSprintSummary(sid, undefined, config);
          } catch (err: any) {
            console.error(`Sprint summary error for #${sid}: ${err.message}`);
          }
        }
      }
    },
  });
} else {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
