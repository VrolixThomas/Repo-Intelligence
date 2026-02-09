/**
 * Standalone DB verification script.
 *
 * Usage:
 *   bun run db-test.ts          # run all tests
 *   bun run db-test.ts --reset  # clear tables and run tests
 */

import { getDb, closeDb } from "./src/db/index";
import {
  startRun,
  completeRun,
  getLastRun,
  storeCommits,
  updateBranches,
  getCommitsForRun,
  getJiraKeysForRun,
  getTotalCommitCount,
} from "./src/db/queries";
import { runs, commits, branches, tickets, ticketSummaries, sprints, sprintTickets, sprintSummaries, pullRequests, prActivities, ticketStatusChanges } from "./src/db/schema";
import type { CommitInfo, BranchInfo } from "./src/git/scanner";

const args = process.argv.slice(2);
const shouldReset = args.includes("--reset");

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function makeCommit(overrides: Partial<CommitInfo> = {}): CommitInfo {
  const sha = overrides.sha ?? Math.random().toString(36).substring(2, 42).padEnd(40, "0");
  return {
    sha,
    shortSha: sha.substring(0, 8),
    authorName: "Test Author",
    authorEmail: "test@example.com",
    date: new Date().toISOString(),
    message: "test commit",
    branch: "main",
    repo: "test-repo",
    filesChanged: 1,
    insertions: 10,
    deletions: 5,
    diffStat: "",
    jiraKeys: [],
    ...overrides,
  };
}

function makeBranch(overrides: Partial<BranchInfo> = {}): BranchInfo {
  return {
    name: "feature/test",
    remote: "origin",
    lastCommitSha: "abc123",
    lastCommitDate: new Date().toISOString(),
    lastCommitAuthorEmail: "test@example.com",
    lastCommitMessage: "test",
    ...overrides,
  };
}

async function main() {
  console.log("=== CodingSummary DB Test ===\n");
  console.log("DB: Supabase PostgreSQL via DATABASE_URL");

  if (shouldReset) {
    console.log("Clearing all tables...");
    const db = getDb();
    // Delete in dependency order
    await db.delete(prActivities);
    await db.delete(pullRequests);
    await db.delete(ticketStatusChanges);
    await db.delete(sprintSummaries);
    await db.delete(sprintTickets);
    await db.delete(sprints);
    await db.delete(ticketSummaries);
    await db.delete(tickets);
    await db.delete(commits);
    await db.delete(branches);
    await db.delete(runs);
    console.log("Tables cleared.\n");
  }

  // ── Test 1: Run lifecycle ──────────────────────────────────────────────────
  console.log("Test 1: Run lifecycle");
  const runId = await startRun();
  assert(typeof runId === "number" && runId > 0, `startRun() returned runId=${runId}`);

  const beforeComplete = await getLastRun();
  assert(
    beforeComplete === undefined || beforeComplete.id !== runId,
    "Incomplete run not returned by getLastRun()"
  );

  await completeRun(runId, 2, 10);
  const lastRun = await getLastRun();
  assert(lastRun !== undefined, "getLastRun() returns a run after completion");
  assert(lastRun?.id === runId, `getLastRun() returns the correct run (id=${lastRun?.id})`);
  assert(lastRun?.reposScanned === 2, `reposScanned = ${lastRun?.reposScanned}`);
  assert(lastRun?.commitsFound === 10, `commitsFound = ${lastRun?.commitsFound}`);
  console.log();

  // ── Test 2: Commit delta detection ─────────────────────────────────────────
  console.log("Test 2: Commit delta detection");
  const runId2 = await startRun();

  const testCommits = [
    makeCommit({ sha: "aaa111aaa111aaa111aaa111aaa111aaa111aaa1", message: "first commit", jiraKeys: ["PI-100"] }),
    makeCommit({ sha: "bbb222bbb222bbb222bbb222bbb222bbb222bbb2", message: "second commit", jiraKeys: ["PI-101", "PI-102"] }),
    makeCommit({ sha: "ccc333ccc333ccc333ccc333ccc333ccc333ccc3", message: "third commit" }),
  ];

  const result1 = await storeCommits(testCommits, runId2);
  assert(result1.newCommits.length === 3, `First insert: ${result1.newCommits.length} new (expected 3)`);
  assert(result1.existingCount === 0, `First insert: ${result1.existingCount} existing (expected 0)`);

  // Insert same commits again — should detect all as existing
  const result2 = await storeCommits(testCommits, runId2);
  assert(result2.newCommits.length === 0, `Second insert: ${result2.newCommits.length} new (expected 0)`);
  assert(result2.existingCount === 3, `Second insert: ${result2.existingCount} existing (expected 3)`);

  // Insert mix of new and existing
  const mixedCommits: CommitInfo[] = [
    testCommits[0]!, // existing
    makeCommit({ sha: "ddd444ddd444ddd444ddd444ddd444ddd444ddd4", message: "fourth commit" }), // new
  ];
  const result3 = await storeCommits(mixedCommits, runId2);
  assert(result3.newCommits.length === 1, `Mixed insert: ${result3.newCommits.length} new (expected 1)`);
  assert(result3.existingCount === 1, `Mixed insert: ${result3.existingCount} existing (expected 1)`);

  await completeRun(runId2, 1, result1.newCommits.length + result3.newCommits.length);

  // Query helpers
  const runCommits = await getCommitsForRun(runId2);
  assert(runCommits.length === 4, `getCommitsForRun: ${runCommits.length} commits (expected 4)`);

  const jiraKeys = await getJiraKeysForRun(runId2);
  assert(jiraKeys.includes("PI-100"), "Jira key PI-100 found");
  assert(jiraKeys.includes("PI-101"), "Jira key PI-101 found");
  assert(jiraKeys.includes("PI-102"), "Jira key PI-102 found");
  assert(jiraKeys.length === 3, `Total jira keys: ${jiraKeys.length} (expected 3)`);

  const totalCount = await getTotalCommitCount();
  assert(totalCount >= 4, `Total commits in DB: ${totalCount} (expected >= 4)`);
  console.log();

  // ── Test 3: Branch tracking ────────────────────────────────────────────────
  console.log("Test 3: Branch tracking");

  const branchSet1: BranchInfo[] = [
    makeBranch({ name: "feature/PI-100-login" }),
    makeBranch({ name: "feature/PI-101-signup" }),
    makeBranch({ name: "main" }),
  ];

  const br1 = await updateBranches("test-repo", branchSet1);
  assert(br1.newBranches.length === 3, `First update: ${br1.newBranches.length} new (expected 3)`);
  assert(br1.updatedBranches.length === 0, `First update: ${br1.updatedBranches.length} updated (expected 0)`);
  assert(br1.goneBranches.length === 0, `First update: ${br1.goneBranches.length} gone (expected 0)`);

  // Second update: remove one branch, keep two
  const branchSet2: BranchInfo[] = [
    makeBranch({ name: "feature/PI-100-login" }),
    makeBranch({ name: "main" }),
  ];

  const br2 = await updateBranches("test-repo", branchSet2);
  assert(br2.newBranches.length === 0, `Second update: ${br2.newBranches.length} new (expected 0)`);
  assert(br2.updatedBranches.length === 2, `Second update: ${br2.updatedBranches.length} updated (expected 2)`);
  assert(br2.goneBranches.length === 1, `Second update: ${br2.goneBranches.length} gone (expected 1)`);
  assert(
    br2.goneBranches.includes("feature/PI-101-signup"),
    `Gone branch is feature/PI-101-signup`
  );
  console.log();

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("========== RESULTS ==========");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  await closeDb();

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\nAll tests passed!");
  }
}

main();
