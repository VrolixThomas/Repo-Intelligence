import { eq, desc, isNotNull, and, inArray, count, sql, or, lt, like, gte, lte, asc } from "drizzle-orm";
import { getDb } from "./index";
import { runs, commits, branches, tickets, ticketSummaries, sprints, sprintTickets, sprintSummaries, pullRequests, prActivities, ticketStatusChanges } from "./schema";
import type { CommitInfo, BranchInfo } from "../git/scanner";
import type { TicketData, StatusChange } from "../jira/tickets";
import type { PullRequestData, PullRequestFullData } from "../bitbucket/pullrequests";
import type { PRActivityEntry } from "../bitbucket/pr-activity";

// ── Run Lifecycle ─────────────────────────────────────────────────────────────

export async function startRun(scanSince?: string, scanUntil?: string): Promise<number> {
  const db = getDb();
  const [result] = await db
    .insert(runs)
    .values({
      startedAt: new Date().toISOString(),
      scanSince: scanSince ?? null,
      scanUntil: scanUntil ?? null,
    })
    .returning({ id: runs.id });
  return result!.id;
}

export async function completeRun(runId: number, reposScanned: number, commitsFound: number) {
  const db = getDb();
  await db.update(runs)
    .set({
      completedAt: new Date().toISOString(),
      reposScanned,
      commitsFound,
    })
    .where(eq(runs.id, runId));
}

export async function getLastRun() {
  const db = getDb();
  const [row] = await db
    .select()
    .from(runs)
    .where(isNotNull(runs.completedAt))
    .orderBy(desc(runs.id))
    .limit(1);
  return row;
}

// ── Commit Storage (Delta Detection) ──────────────────────────────────────────

const SHA_CHUNK_SIZE = 500;

/**
 * Store commits, returning which are new vs already seen.
 * Uses SELECT-then-INSERT to know exactly which commits are new.
 */
export async function storeCommits(
  commitInfos: CommitInfo[],
  runId: number
): Promise<{ newCommits: CommitInfo[]; existingCount: number }> {
  if (commitInfos.length === 0) {
    return { newCommits: [], existingCount: 0 };
  }

  const db = getDb();

  // Batch-check which SHAs already exist (chunked for variable limit)
  const allShas = commitInfos.map((c) => c.sha);
  const existingShas = new Set<string>();

  for (let i = 0; i < allShas.length; i += SHA_CHUNK_SIZE) {
    const chunk = allShas.slice(i, i + SHA_CHUNK_SIZE);
    const found = await db
      .select({ sha: commits.sha })
      .from(commits)
      .where(inArray(commits.sha, chunk));
    for (const row of found) {
      existingShas.add(row.sha);
    }
  }

  // Split into new vs existing
  const newCommits = commitInfos.filter((c) => !existingShas.has(c.sha));
  const existingCount = commitInfos.length - newCommits.length;

  // Insert only new commits
  if (newCommits.length > 0) {
    const values = newCommits.map((c) => ({
      sha: c.sha,
      shortSha: c.shortSha,
      repo: c.repo,
      branch: c.branch,
      authorName: c.authorName,
      authorEmail: c.authorEmail,
      message: c.message,
      timestamp: c.date,
      filesChanged: c.filesChanged,
      insertions: c.insertions,
      deletions: c.deletions,
      diffSummary: c.diffStat || null,
      firstSeenRun: runId,
      jiraKeys: c.jiraKeys.length > 0 ? c.jiraKeys.join(",") : null,
    }));

    // Insert in chunks to stay within limits
    for (let i = 0; i < values.length; i += SHA_CHUNK_SIZE) {
      const chunk = values.slice(i, i + SHA_CHUNK_SIZE);
      await db.insert(commits).values(chunk);
    }
  }

  return { newCommits, existingCount };
}

// ── Branch Tracking ───────────────────────────────────────────────────────────

export async function updateBranches(
  repoName: string,
  branchInfos: BranchInfo[]
): Promise<{ newBranches: string[]; updatedBranches: string[]; goneBranches: string[] }> {
  const db = getDb();
  const now = new Date().toISOString();

  // Step 1: Mark all branches for this repo as inactive
  await db.update(branches)
    .set({ isActive: 0 })
    .where(eq(branches.repo, repoName));

  const newBranches: string[] = [];
  const updatedBranches: string[] = [];

  // Step 2: Upsert current branches
  for (const b of branchInfos) {
    // Extract jira key from branch name
    const jiraMatch = b.name.match(/([A-Z][A-Z0-9]+-(?!0+\b)\d+)/);
    const jiraKey = jiraMatch ? jiraMatch[1] : null;

    // Check if branch already exists
    const [existing] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.repo, repoName), eq(branches.name, b.name)));

    if (existing) {
      // Update existing branch
      await db.update(branches)
        .set({
          lastSeen: now,
          lastCommitSha: b.lastCommitSha,
          lastCommitDate: b.lastCommitDate,
          authorEmail: b.lastCommitAuthorEmail,
          isActive: 1,
          jiraKey,
        })
        .where(eq(branches.id, existing.id));
      updatedBranches.push(b.name);
    } else {
      // Insert new branch
      await db.insert(branches)
        .values({
          repo: repoName,
          name: b.name,
          authorEmail: b.lastCommitAuthorEmail,
          firstSeen: now,
          lastSeen: now,
          lastCommitSha: b.lastCommitSha,
          lastCommitDate: b.lastCommitDate,
          isActive: 1,
          jiraKey,
        });
      newBranches.push(b.name);
    }
  }

  // Step 3: Find branches that are still inactive (gone from remote)
  const goneRows = await db
    .select({ name: branches.name })
    .from(branches)
    .where(and(eq(branches.repo, repoName), eq(branches.isActive, 0)));
  const goneBranches = goneRows.map((r) => r.name);

  return { newBranches, updatedBranches, goneBranches };
}

// ── PR Updates ───────────────────────────────────────────────────────────────

export async function updateBranchPR(repoName: string, branchName: string, pr: PullRequestData): Promise<void> {
  const db = getDb();
  await db.update(branches)
    .set({
      prId: pr.prId,
      prTitle: pr.prTitle,
      prState: pr.prState,
      prUrl: pr.prUrl,
      prTargetBranch: pr.prTargetBranch,
      prReviewers: JSON.stringify(pr.prReviewers),
      prApprovals: pr.prApprovals,
      prCreatedAt: pr.prCreatedAt,
      prUpdatedAt: pr.prUpdatedAt,
    })
    .where(and(eq(branches.repo, repoName), eq(branches.name, branchName)));
}

// ── Query Helpers ─────────────────────────────────────────────────────────────

export async function getCommitsForRun(runId: number) {
  const db = getDb();
  return await db
    .select()
    .from(commits)
    .where(eq(commits.firstSeenRun, runId))
    .orderBy(commits.repo, commits.authorEmail, commits.timestamp);
}

export async function getJiraKeysForRun(runId: number): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ jiraKeys: commits.jiraKeys })
    .from(commits)
    .where(and(eq(commits.firstSeenRun, runId), isNotNull(commits.jiraKeys)));

  const keys = new Set<string>();
  for (const row of rows) {
    if (row.jiraKeys) {
      for (const key of row.jiraKeys.split(",")) {
        keys.add(key.trim());
      }
    }
  }
  return [...keys];
}

export async function getTotalCommitCount(): Promise<number> {
  const db = getDb();
  const [result] = await db.select({ count: count() }).from(commits);
  return result?.count ?? 0;
}

// ── Ticket Cache ─────────────────────────────────────────────────────────────

/**
 * Return ticket keys that are either not in DB or have a stale last_fetched.
 */
export async function getStaleTicketKeys(jiraKeys: string[], maxAgeMinutes = 60): Promise<string[]> {
  if (jiraKeys.length === 0) return [];

  const db = getDb();
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString();

  // Find keys that exist and are fresh
  const freshKeys = new Set<string>();
  for (let i = 0; i < jiraKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = jiraKeys.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select({ jiraKey: tickets.jiraKey })
      .from(tickets)
      .where(and(
        inArray(tickets.jiraKey, chunk),
        sql`${tickets.lastFetched} >= ${cutoff}`
      ));
    for (const row of rows) {
      freshKeys.add(row.jiraKey);
    }
  }

  return jiraKeys.filter((k) => !freshKeys.has(k));
}

/**
 * Insert or update tickets in the DB.
 */
export async function upsertTickets(ticketData: TicketData[]): Promise<void> {
  if (ticketData.length === 0) return;

  const db = getDb();
  const now = new Date().toISOString();

  for (const t of ticketData) {
    const [existing] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.jiraKey, t.jiraKey));

    if (existing) {
      await db.update(tickets)
        .set({
          summary: t.summary,
          description: t.description,
          status: t.status,
          assignee: t.assignee,
          priority: t.priority,
          ticketType: t.ticketType,
          parentKey: t.parentKey,
          subtasks: t.subtasks,
          labels: t.labels,
          commentsJson: t.commentsJson,
          lastFetched: now,
          lastJiraUpdated: t.lastJiraUpdated,
          dataJson: t.dataJson,
        })
        .where(eq(tickets.id, existing.id));
    } else {
      await db.insert(tickets)
        .values({
          jiraKey: t.jiraKey,
          summary: t.summary,
          description: t.description,
          status: t.status,
          assignee: t.assignee,
          priority: t.priority,
          ticketType: t.ticketType,
          parentKey: t.parentKey,
          subtasks: t.subtasks,
          labels: t.labels,
          commentsJson: t.commentsJson,
          lastFetched: now,
          lastJiraUpdated: t.lastJiraUpdated,
          dataJson: t.dataJson,
        });
    }

    // Store status changes from changelog
    if (t.statusChanges && t.statusChanges.length > 0) {
      await upsertTicketStatusChanges(t.jiraKey, t.statusChanges);
    }
  }
}

/**
 * Fetch cached tickets by their Jira keys.
 */
export async function getTicketsByKeys(jiraKeys: string[]) {
  if (jiraKeys.length === 0) return [];

  const db = getDb();
  const results: (typeof tickets.$inferSelect)[] = [];

  for (let i = 0; i < jiraKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = jiraKeys.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select()
      .from(tickets)
      .where(inArray(tickets.jiraKey, chunk));
    results.push(...rows);
  }

  return results;
}

// ── Run Updates ──────────────────────────────────────────────────────────────

export async function setRunReportPath(runId: number, reportPath: string): Promise<void> {
  const db = getDb();
  await db.update(runs)
    .set({ reportPath })
    .where(eq(runs.id, runId));
}

// ── Ticket Summary Storage ───────────────────────────────────────────────────

export async function storeTicketSummary(params: {
  runId: number;
  jiraKey: string;
  repo: string;
  commitShas: string[];
  authorEmails: string[];
  branchNames: string[];
  summaryText: string;
  sessionId: string | null;
}): Promise<number> {
  const db = getDb();
  const [result] = await db
    .insert(ticketSummaries)
    .values({
      runId: params.runId,
      jiraKey: params.jiraKey,
      repo: params.repo,
      commitShas: JSON.stringify(params.commitShas),
      authorEmails: params.authorEmails.join(","),
      branchNames: JSON.stringify(params.branchNames),
      summaryText: params.summaryText,
      sessionId: params.sessionId,
      createdAt: new Date().toISOString(),
    })
    .returning({ id: ticketSummaries.id });
  return result!.id;
}

export async function getTicketSummariesForRun(runId: number) {
  const db = getDb();
  return await db
    .select()
    .from(ticketSummaries)
    .where(eq(ticketSummaries.runId, runId))
    .orderBy(ticketSummaries.jiraKey, ticketSummaries.repo);
}

/**
 * Get the most recent summary for a given jiraKey + repo.
 * Used for incremental analysis — builds on previous day's analysis.
 */
export async function getLatestTicketSummary(jiraKey: string, repo: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(ticketSummaries)
    .where(and(eq(ticketSummaries.jiraKey, jiraKey), eq(ticketSummaries.repo, repo)))
    .orderBy(desc(ticketSummaries.id))
    .limit(1);
  return row;
}

/**
 * Get all summaries for a ticket across all runs (history).
 */
export async function getTicketSummariesByKey(jiraKey: string) {
  const db = getDb();
  return await db
    .select()
    .from(ticketSummaries)
    .where(eq(ticketSummaries.jiraKey, jiraKey))
    .orderBy(desc(ticketSummaries.id));
}

/**
 * Batch lookup: get latest summary per ticket for a set of keys.
 */
export async function getTicketSummariesByKeys(jiraKeys: string[]) {
  if (jiraKeys.length === 0) return [];
  const db = getDb();
  const results: (typeof ticketSummaries.$inferSelect)[] = [];

  for (let i = 0; i < jiraKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = jiraKeys.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select()
      .from(ticketSummaries)
      .where(inArray(ticketSummaries.jiraKey, chunk))
      .orderBy(desc(ticketSummaries.id));
    results.push(...rows);
  }

  // Deduplicate: keep only the latest per jiraKey+repo
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.jiraKey}|${r.repo}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Web Dashboard Queries ────────────────────────────────────────────────────

export async function getAllRuns() {
  const db = getDb();
  return await db
    .select()
    .from(runs)
    .where(isNotNull(runs.completedAt))
    .orderBy(desc(runs.id));
}

export async function getRunById(runId: number) {
  const db = getDb();
  const [row] = await db.select().from(runs).where(eq(runs.id, runId));
  return row;
}

export interface CommitFilter {
  repo?: string;
  authorEmail?: string;
  since?: string;
  until?: string;
  search?: string;
}

export async function getCommitsPaginated(
  filter: CommitFilter,
  page: number,
  pageSize: number
): Promise<{ commits: (typeof commits.$inferSelect)[]; total: number }> {
  const db = getDb();
  const conditions = [TEST_REPO_FILTER];

  if (filter.repo) conditions.push(eq(commits.repo, filter.repo));
  if (filter.authorEmail) conditions.push(eq(commits.authorEmail, filter.authorEmail));
  if (filter.since) conditions.push(gte(commits.timestamp, filter.since));
  if (filter.until) conditions.push(lte(commits.timestamp, filter.until));
  if (filter.search) conditions.push(like(commits.message, `%${filter.search}%`));

  const where = and(...conditions);

  const [totalResult] = await db
    .select({ count: count() })
    .from(commits)
    .where(where);
  const total = totalResult?.count ?? 0;

  const offset = (page - 1) * pageSize;
  const rows = await db
    .select()
    .from(commits)
    .where(where)
    .orderBy(desc(commits.timestamp))
    .limit(pageSize)
    .offset(offset);

  return { commits: rows, total };
}

export async function getMemberStats(emails: string[]) {
  if (emails.length === 0) return { commitCount: 0, activeBranchCount: 0, lastActivity: null };
  const db = getDb();

  const [commitResult] = await db
    .select({ count: count() })
    .from(commits)
    .where(and(inArray(commits.authorEmail, emails), TEST_REPO_FILTER));
  const commitCount = commitResult?.count ?? 0;

  const [branchResult] = await db
    .select({ count: count() })
    .from(branches)
    .where(and(
      inArray(branches.authorEmail, emails),
      eq(branches.isActive, 1),
      sql`${branches.repo} != 'test-repo'`
    ));
  const activeBranchCount = branchResult?.count ?? 0;

  const [lastCommit] = await db
    .select({ timestamp: commits.timestamp })
    .from(commits)
    .where(and(inArray(commits.authorEmail, emails), TEST_REPO_FILTER))
    .orderBy(desc(commits.timestamp))
    .limit(1);

  return { commitCount, activeBranchCount, lastActivity: lastCommit?.timestamp ?? null };
}

export async function getMemberCommits(
  emails: string[],
  page: number,
  pageSize: number
): Promise<{ commits: (typeof commits.$inferSelect)[]; total: number }> {
  if (emails.length === 0) return { commits: [], total: 0 };
  const db = getDb();

  const [totalResult] = await db
    .select({ count: count() })
    .from(commits)
    .where(and(inArray(commits.authorEmail, emails), TEST_REPO_FILTER));
  const total = totalResult?.count ?? 0;

  const offset = (page - 1) * pageSize;
  const rows = await db
    .select()
    .from(commits)
    .where(and(inArray(commits.authorEmail, emails), TEST_REPO_FILTER))
    .orderBy(desc(commits.timestamp))
    .limit(pageSize)
    .offset(offset);

  return { commits: rows, total };
}

export async function getMemberBranches(emails: string[]) {
  if (emails.length === 0) return [];
  const db = getDb();
  return await db
    .select()
    .from(branches)
    .where(and(
      inArray(branches.authorEmail, emails),
      eq(branches.isActive, 1),
      sql`${branches.repo} != 'test-repo'`
    ))
    .orderBy(desc(branches.lastSeen));
}

export async function getMemberTicketSummaries(emails: string[], limit = 5) {
  if (emails.length === 0) return [];
  const db = getDb();
  // Find ticket summaries where any of the emails appear in authorEmails
  const results: (typeof ticketSummaries.$inferSelect)[] = [];
  for (const email of emails) {
    const rows = await db
      .select()
      .from(ticketSummaries)
      .where(like(ticketSummaries.authorEmails, `%${email}%`))
      .orderBy(desc(ticketSummaries.createdAt))
      .limit(limit);
    results.push(...rows);
  }
  // Deduplicate and sort by createdAt desc, limit
  const seen = new Set<number>();
  return results
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function getAllTickets() {
  const db = getDb();
  return await db.select().from(tickets).orderBy(tickets.jiraKey);
}

export async function getTicketsGroupedByStatus(): Promise<Record<string, (typeof tickets.$inferSelect)[]>> {
  const db = getDb();
  const allTickets = await db.select().from(tickets).orderBy(tickets.jiraKey);
  const grouped: Record<string, (typeof tickets.$inferSelect)[]> = {};
  for (const t of allTickets) {
    const status = t.status ?? "Unknown";
    if (!grouped[status]) grouped[status] = [];
    grouped[status]!.push(t);
  }
  return grouped;
}

export async function getTicketCommitCounts(jiraKeys: string[]): Promise<Record<string, number>> {
  if (jiraKeys.length === 0) return {};
  const db = getDb();

  // Single pass: fetch all commits that have jira_keys set
  const rows = await db
    .select({ jiraKeys: commits.jiraKeys })
    .from(commits)
    .where(isNotNull(commits.jiraKeys));

  const counts: Record<string, number> = {};
  const keySet = new Set(jiraKeys);
  for (const row of rows) {
    if (!row.jiraKeys) continue;
    for (const key of row.jiraKeys.split(",")) {
      const trimmed = key.trim();
      if (keySet.has(trimmed)) {
        counts[trimmed] = (counts[trimmed] ?? 0) + 1;
      }
    }
  }
  return counts;
}

const TEST_REPO_FILTER = sql`${commits.repo} != 'test-repo'`;

export async function getDashboardStats() {
  const db = getDb();

  const [totalRunsResult] = await db
    .select({ count: count() })
    .from(runs)
    .where(isNotNull(runs.completedAt));
  const totalRuns = totalRunsResult?.count ?? 0;

  const [totalCommitsResult] = await db
    .select({ count: count() })
    .from(commits)
    .where(TEST_REPO_FILTER);
  const totalCommits = totalCommitsResult?.count ?? 0;

  const authorRows = await db
    .select({ email: commits.authorEmail })
    .from(commits)
    .where(TEST_REPO_FILTER)
    .groupBy(commits.authorEmail);
  const activeMembers = authorRows.length;

  // Count only tickets referenced by commits (not all cached tickets)
  const ticketKeyRows = await db
    .select({ jiraKeys: commits.jiraKeys })
    .from(commits)
    .where(and(TEST_REPO_FILTER, isNotNull(commits.jiraKeys)));
  const referencedKeys = new Set<string>();
  for (const row of ticketKeyRows) {
    if (row.jiraKeys) {
      for (const key of row.jiraKeys.split(",")) referencedKeys.add(key.trim());
    }
  }
  const activeTickets = referencedKeys.size;

  return { totalRuns, totalCommits, activeMembers, activeTickets };
}

export async function getDistinctRepos(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ repo: commits.repo })
    .from(commits)
    .where(TEST_REPO_FILTER)
    .groupBy(commits.repo);
  return rows.map((r) => r.repo);
}

export async function getDistinctAuthors(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ email: commits.authorEmail })
    .from(commits)
    .where(TEST_REPO_FILTER)
    .groupBy(commits.authorEmail);
  return rows.map((r) => r.email);
}

// ── Referenced Tickets (for dashboard) ────────────────────────────────────────

/**
 * Get only tickets that are referenced by stored commits (excluding test-repo),
 * grouped by status.
 */
export async function getReferencedTicketsGrouped(): Promise<Record<string, (typeof tickets.$inferSelect)[]>> {
  const db = getDb();

  // Collect all jira_keys from non-test-repo commits
  const rows = await db
    .select({ jiraKeys: commits.jiraKeys })
    .from(commits)
    .where(and(TEST_REPO_FILTER, isNotNull(commits.jiraKeys)));

  const referencedKeys = new Set<string>();
  for (const row of rows) {
    if (row.jiraKeys) {
      for (const key of row.jiraKeys.split(",")) {
        referencedKeys.add(key.trim());
      }
    }
  }

  if (referencedKeys.size === 0) return {};

  // Look up those keys in tickets table
  const keyArray = [...referencedKeys];
  const ticketRows: (typeof tickets.$inferSelect)[] = [];
  for (let i = 0; i < keyArray.length; i += SHA_CHUNK_SIZE) {
    const chunk = keyArray.slice(i, i + SHA_CHUNK_SIZE);
    const found = await db
      .select()
      .from(tickets)
      .where(inArray(tickets.jiraKey, chunk));
    ticketRows.push(...found);
  }

  // Group by status
  const grouped: Record<string, (typeof tickets.$inferSelect)[]> = {};
  for (const t of ticketRows) {
    const status = t.status ?? "Unknown";
    if (!grouped[status]) grouped[status] = [];
    grouped[status]!.push(t);
  }
  return grouped;
}

// ── Branch View ──────────────────────────────────────────────────────────────

export interface BranchWithCommitsResult {
  branch: typeof branches.$inferSelect;
  branchCommits: (typeof commits.$inferSelect)[];
  ticket: (typeof tickets.$inferSelect) | null;
}

export async function getBranchesWithCommits(filter?: {
  repo?: string;
  authorEmail?: string;
}): Promise<BranchWithCommitsResult[]> {
  const db = getDb();

  // Get active branches excluding test-repo
  const conditions = [
    sql`${branches.repo} != 'test-repo'`,
    eq(branches.isActive, 1),
  ];
  if (filter?.repo) conditions.push(eq(branches.repo, filter.repo));
  if (filter?.authorEmail) conditions.push(eq(branches.authorEmail, filter.authorEmail));

  const branchRows = await db
    .select()
    .from(branches)
    .where(and(...conditions))
    .orderBy(desc(branches.lastSeen));

  const results: BranchWithCommitsResult[] = [];

  for (const branch of branchRows) {
    // Get commits for this branch
    const branchCommits = await db
      .select()
      .from(commits)
      .where(and(
        eq(commits.repo, branch.repo),
        eq(commits.branch, branch.name),
      ))
      .orderBy(desc(commits.timestamp));

    // Look up ticket if branch has a jira key
    let ticket: (typeof tickets.$inferSelect) | null = null;
    if (branch.jiraKey) {
      const [row] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.jiraKey, branch.jiraKey));
      ticket = row ?? null;
    }

    results.push({ branch, branchCommits, ticket });
  }

  return results;
}

// ── Sprint Queries ──────────────────────────────────────────────────────────

export interface SprintInsert {
  jiraSprintId: number;
  boardId: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
}

export async function upsertSprints(data: SprintInsert[]): Promise<void> {
  if (data.length === 0) return;
  const db = getDb();
  const now = new Date().toISOString();

  for (const s of data) {
    const [existing] = await db
      .select({ id: sprints.id })
      .from(sprints)
      .where(eq(sprints.jiraSprintId, s.jiraSprintId));

    if (existing) {
      await db.update(sprints)
        .set({
          name: s.name,
          state: s.state,
          startDate: s.startDate,
          endDate: s.endDate,
          goal: s.goal,
          lastFetched: now,
        })
        .where(eq(sprints.id, existing.id));
    } else {
      await db.insert(sprints)
        .values({
          jiraSprintId: s.jiraSprintId,
          boardId: s.boardId,
          name: s.name,
          state: s.state,
          startDate: s.startDate,
          endDate: s.endDate,
          goal: s.goal,
          lastFetched: now,
        });
    }
  }
}

export async function upsertSprintTickets(sprintId: number, jiraKeys: string[]): Promise<void> {
  if (jiraKeys.length === 0) return;
  const db = getDb();

  for (const key of jiraKeys) {
    const [existing] = await db
      .select({ id: sprintTickets.id })
      .from(sprintTickets)
      .where(and(eq(sprintTickets.sprintId, sprintId), eq(sprintTickets.jiraKey, key)));

    if (!existing) {
      await db.insert(sprintTickets)
        .values({ sprintId, jiraKey: key });
    }
  }
}

export async function getActiveSprint() {
  const db = getDb();
  const [row] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.state, "active"))
    .orderBy(desc(sprints.id))
    .limit(1);
  return row;
}

export async function getAllSprints() {
  const db = getDb();
  return await db
    .select()
    .from(sprints)
    .orderBy(desc(sprints.jiraSprintId));
}

export async function getSprintById(id: number) {
  const db = getDb();
  const [row] = await db.select().from(sprints).where(eq(sprints.id, id));
  return row;
}

export async function getSprintByJiraId(jiraSprintId: number) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.jiraSprintId, jiraSprintId));
  return row;
}

export async function getSprintTicketKeys(sprintId: number): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ jiraKey: sprintTickets.jiraKey })
    .from(sprintTickets)
    .where(eq(sprintTickets.sprintId, sprintId));
  return rows.map((r) => r.jiraKey);
}

export async function getSprintTickets(sprintId: number) {
  const db = getDb();
  const keys = await getSprintTicketKeys(sprintId);
  if (keys.length === 0) return [];

  const results: (typeof tickets.$inferSelect)[] = [];
  for (let i = 0; i < keys.length; i += SHA_CHUNK_SIZE) {
    const chunk = keys.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select()
      .from(tickets)
      .where(inArray(tickets.jiraKey, chunk));
    results.push(...rows);
  }
  return results;
}

// ── Sprint-Scoped Queries ───────────────────────────────────────────────────

export async function getSprintCommits(sprintId: number) {
  const db = getDb();
  const sprint = await getSprintById(sprintId);
  if (!sprint) return [];

  const ticketKeys = await getSprintTicketKeys(sprintId);
  if (ticketKeys.length === 0) return [];

  // Get commits that reference any of the sprint's ticket keys
  // within the sprint date range
  const conditions = [TEST_REPO_FILTER];
  if (sprint.startDate) conditions.push(gte(commits.timestamp, sprint.startDate));
  if (sprint.endDate) {
    // Add 1 day to end date to include commits on the last day
    const endPlusOne = new Date(new Date(sprint.endDate).getTime() + 86_400_000).toISOString();
    conditions.push(lte(commits.timestamp, endPlusOne));
  }

  const allCommits = await db
    .select()
    .from(commits)
    .where(and(...conditions, isNotNull(commits.jiraKeys)))
    .orderBy(desc(commits.timestamp));

  const keySet = new Set(ticketKeys);
  return allCommits.filter((c) => {
    if (!c.jiraKeys) return false;
    return c.jiraKeys.split(",").some((k) => keySet.has(k.trim()));
  });
}

export async function getSprintBranches(sprintId: number): Promise<BranchWithCommitsResult[]> {
  const db = getDb();
  const ticketKeys = await getSprintTicketKeys(sprintId);
  if (ticketKeys.length === 0) return [];

  const keySet = new Set(ticketKeys);

  // Get branches whose jiraKey is in sprint tickets
  const allBranchRows = await db
    .select()
    .from(branches)
    .where(and(
      sql`${branches.repo} != 'test-repo'`,
      isNotNull(branches.jiraKey),
    ))
    .orderBy(desc(branches.lastSeen));

  const branchRows = allBranchRows.filter((b) => b.jiraKey && keySet.has(b.jiraKey));

  const results: BranchWithCommitsResult[] = [];
  for (const branch of branchRows) {
    const branchCommits = await db
      .select()
      .from(commits)
      .where(and(eq(commits.repo, branch.repo), eq(commits.branch, branch.name)))
      .orderBy(desc(commits.timestamp));

    let ticket: (typeof tickets.$inferSelect) | null = null;
    if (branch.jiraKey) {
      const [row] = await db.select().from(tickets).where(eq(tickets.jiraKey, branch.jiraKey));
      ticket = row ?? null;
    }

    results.push({ branch, branchCommits, ticket });
  }

  return results;
}

// ── Daily Activity Queries ──────────────────────────────────────────────────

export async function getTeamDailyActivity(
  team: { name: string; emails: string[] }[],
  date: string
): Promise<{ member: { name: string; emails: string[] }; commits: (typeof commits.$inferSelect)[]; branches: string[] }[]> {
  const db = getDb();
  const nextDate = new Date(new Date(date).getTime() + 86_400_000).toISOString().split("T")[0]!;

  const results = [];
  for (const member of team) {
    if (member.emails.length === 0) {
      results.push({ member, commits: [], branches: [] });
      continue;
    }

    const dayCommits = await db
      .select()
      .from(commits)
      .where(and(
        inArray(commits.authorEmail, member.emails),
        gte(commits.timestamp, date),
        lte(commits.timestamp, nextDate + "T00:00:00.000Z"),
        TEST_REPO_FILTER,
      ))
      .orderBy(desc(commits.timestamp));

    const branchNames = [...new Set(dayCommits.map((c) => c.branch))];

    results.push({ member, commits: dayCommits, branches: branchNames });
  }
  return results;
}

export interface EnrichedBranchDetail {
  name: string;
  repo: string;
  branch: (typeof branches.$inferSelect) | null;
  ticket: (typeof tickets.$inferSelect) | null;
}

export interface EnrichedDailyActivity {
  member: { name: string; emails: string[] };
  commits: (typeof commits.$inferSelect)[];
  branches: EnrichedBranchDetail[];
  tickets: (typeof tickets.$inferSelect)[];
  ticketSummaries: (typeof ticketSummaries.$inferSelect)[];
}

export async function getEnrichedDailyActivity(
  team: { name: string; emails: string[] }[],
  date: string
): Promise<EnrichedDailyActivity[]> {
  const db = getDb();
  const nextDate = new Date(new Date(date).getTime() + 86_400_000).toISOString().split("T")[0]!;

  const results: EnrichedDailyActivity[] = [];
  for (const member of team) {
    if (member.emails.length === 0) {
      results.push({ member, commits: [], branches: [], tickets: [], ticketSummaries: [] });
      continue;
    }

    // 1. Get day's commits
    const dayCommits = await db
      .select()
      .from(commits)
      .where(and(
        inArray(commits.authorEmail, member.emails),
        gte(commits.timestamp, date),
        lte(commits.timestamp, nextDate + "T00:00:00.000Z"),
        TEST_REPO_FILTER,
      ))
      .orderBy(desc(commits.timestamp));

    if (dayCommits.length === 0) {
      results.push({ member, commits: [], branches: [], tickets: [], ticketSummaries: [] });
      continue;
    }

    // 2. For each unique branch, look up branch row + linked ticket
    const branchKeys = [...new Set(dayCommits.map((c) => `${c.repo}::${c.branch}`))];
    const branchDetails: EnrichedBranchDetail[] = [];
    for (const key of branchKeys) {
      const [repo, branchName] = key.split("::");
      if (!repo || !branchName) continue;
      const [branchRow] = await db
        .select()
        .from(branches)
        .where(and(eq(branches.repo, repo), eq(branches.name, branchName)));

      let ticket: (typeof tickets.$inferSelect) | null = null;
      if (branchRow?.jiraKey) {
        const [ticketRow] = await db.select().from(tickets).where(eq(tickets.jiraKey, branchRow.jiraKey));
        ticket = ticketRow ?? null;
      }

      branchDetails.push({ name: branchName, repo, branch: branchRow ?? null, ticket });
    }

    // 3. Collect additional tickets from commits.jiraKeys
    const ticketKeySet = new Set<string>();
    for (const c of dayCommits) {
      if (c.jiraKeys) {
        for (const k of c.jiraKeys.split(",")) ticketKeySet.add(k.trim());
      }
    }
    // Also add branch-linked ticket keys
    for (const bd of branchDetails) {
      if (bd.branch?.jiraKey) ticketKeySet.add(bd.branch.jiraKey);
    }
    const ticketKeys = [...ticketKeySet];
    const ticketRows = ticketKeys.length > 0 ? await getTicketsByKeys(ticketKeys) : [];

    // 4. Find ticket summaries whose commitShas overlap with this day's commits
    const dayShas = new Set(dayCommits.map((c) => c.sha));
    const matchedSummaries: (typeof ticketSummaries.$inferSelect)[] = [];

    // Look up ticket summaries by the ticket keys found
    if (ticketKeys.length > 0) {
      const candidateSummaries = await getTicketSummariesByKeys(ticketKeys);
      for (const ts of candidateSummaries) {
        if (!ts.commitShas) continue;
        try {
          const shas: string[] = JSON.parse(ts.commitShas);
          if (shas.some((sha) => dayShas.has(sha))) {
            matchedSummaries.push(ts);
          }
        } catch {
          // commitShas not valid JSON, skip
        }
      }
    }

    results.push({ member, commits: dayCommits, branches: branchDetails, tickets: ticketRows, ticketSummaries: matchedSummaries });
  }
  return results;
}

export async function getDailyCommitCounts(since: string, until: string): Promise<{ date: string; count: number }[]> {
  const db = getDb();
  // until + 1 day to include commits on the last day
  const untilPlusOne = new Date(new Date(until).getTime() + 86_400_000).toISOString().split("T")[0]!;

  const rows = await db.execute<{ date: string; count: number }>(
    sql`SELECT DATE(${commits.timestamp}) as date, COUNT(*)::integer as count
        FROM ${commits}
        WHERE ${commits.timestamp} >= ${since}
          AND ${commits.timestamp} < ${untilPlusOne}
          AND ${commits.repo} != 'test-repo'
        GROUP BY DATE(${commits.timestamp})
        ORDER BY date ASC`
  );

  return rows as unknown as { date: string; count: number }[];
}

// ── Sprint-Scoped Ticket Board ──────────────────────────────────────────────

// ── Ticket Lifecycle Metrics ─────────────────────────────────────────────

export interface TicketLifecycleRow {
  jiraKey: string;
  firstCommitDate: string;
  lastCommitDate: string;
  durationDays: number;
  durationHours: number;
  idleDays: number;
  commitCount: number;
  authorCount: number;
  authorEmails: string[];
  repos: string[];
  branchCount: number;
}

export async function getTicketLifecycleMetrics(jiraKeys?: string[]): Promise<TicketLifecycleRow[]> {
  const db = getDb();
  const now = Date.now();

  // Single scan of commits table
  const rows = await db
    .select({
      jiraKeys: commits.jiraKeys,
      timestamp: commits.timestamp,
      authorEmail: commits.authorEmail,
      repo: commits.repo,
    })
    .from(commits)
    .where(and(TEST_REPO_FILTER, isNotNull(commits.jiraKeys)));

  // Aggregate per jira key
  const agg = new Map<string, {
    firstCommit: string;
    lastCommit: string;
    commits: number;
    authors: Set<string>;
    repos: Set<string>;
  }>();

  const keyFilter = jiraKeys ? new Set(jiraKeys) : null;

  for (const row of rows) {
    if (!row.jiraKeys) continue;
    for (const rawKey of row.jiraKeys.split(",")) {
      const key = rawKey.trim();
      if (keyFilter && !keyFilter.has(key)) continue;

      let entry = agg.get(key);
      if (!entry) {
        entry = { firstCommit: row.timestamp, lastCommit: row.timestamp, commits: 0, authors: new Set(), repos: new Set() };
        agg.set(key, entry);
      }
      if (row.timestamp < entry.firstCommit) entry.firstCommit = row.timestamp;
      if (row.timestamp > entry.lastCommit) entry.lastCommit = row.timestamp;
      entry.commits++;
      entry.authors.add(row.authorEmail);
      entry.repos.add(row.repo);
    }
  }

  // Branch counts per jira key
  const branchRows = await db
    .select({ jiraKey: branches.jiraKey })
    .from(branches)
    .where(and(sql`${branches.repo} != 'test-repo'`, isNotNull(branches.jiraKey)));

  const branchCounts = new Map<string, number>();
  for (const br of branchRows) {
    if (!br.jiraKey) continue;
    if (keyFilter && !keyFilter.has(br.jiraKey)) continue;
    branchCounts.set(br.jiraKey, (branchCounts.get(br.jiraKey) ?? 0) + 1);
  }

  const results: TicketLifecycleRow[] = [];
  for (const [jiraKey, entry] of agg) {
    const firstMs = new Date(entry.firstCommit).getTime();
    const lastMs = new Date(entry.lastCommit).getTime();
    const durationDays = Math.round((lastMs - firstMs) / 86_400_000);
    const durationHours = Math.round((lastMs - firstMs) / 3_600_000 * 10) / 10;
    const idleDays = Math.round((now - lastMs) / 86_400_000);

    results.push({
      jiraKey,
      firstCommitDate: entry.firstCommit,
      lastCommitDate: entry.lastCommit,
      durationDays,
      durationHours,
      idleDays,
      commitCount: entry.commits,
      authorCount: entry.authors.size,
      authorEmails: [...entry.authors],
      repos: [...entry.repos],
      branchCount: branchCounts.get(jiraKey) ?? 0,
    });
  }

  return results;
}

export async function getTicketLifecycleForSprint(sprintId: number): Promise<TicketLifecycleRow[]> {
  const keys = await getSprintTicketKeys(sprintId);
  if (keys.length === 0) return [];
  return getTicketLifecycleMetrics(keys);
}

export async function getSprintTicketsGrouped(sprintId: number): Promise<Record<string, (typeof tickets.$inferSelect)[]>> {
  const sprintTicketList = await getSprintTickets(sprintId);
  const grouped: Record<string, (typeof tickets.$inferSelect)[]> = {};
  for (const t of sprintTicketList) {
    const status = t.status ?? "Unknown";
    if (!grouped[status]) grouped[status] = [];
    grouped[status]!.push(t);
  }
  return grouped;
}

// ── Pull Request Queries ──────────────────────────────────────────────────

/**
 * Upsert pull requests into the pull_requests table.
 * Returns array of { id, prId } for each upserted row.
 */
export async function upsertPullRequests(
  repo: string,
  prs: PullRequestFullData[]
): Promise<{ id: number; prId: number }[]> {
  if (prs.length === 0) return [];
  const db = getDb();
  const results: { id: number; prId: number }[] = [];

  for (const pr of prs) {
    const [existing] = await db
      .select({ id: pullRequests.id })
      .from(pullRequests)
      .where(and(eq(pullRequests.repo, repo), eq(pullRequests.prId, pr.prId)));

    const reviewerNames = pr.participants
      .filter((p) => p.role === "REVIEWER")
      .map((p) => p.displayName);

    if (existing) {
      await db.update(pullRequests)
        .set({
          title: pr.prTitle,
          description: pr.description,
          state: pr.prState,
          url: pr.prUrl,
          sourceBranch: pr.sourceBranch,
          targetBranch: pr.prTargetBranch,
          authorName: pr.authorName,
          reviewers: JSON.stringify(reviewerNames),
          approvals: pr.prApprovals,
          commentCount: pr.commentCount,
          taskCount: pr.taskCount,
          mergeCommitSha: pr.mergeCommitSha,
          updatedAt: pr.prUpdatedAt,
        })
        .where(eq(pullRequests.id, existing.id));
      results.push({ id: existing.id, prId: pr.prId });
    } else {
      const [row] = await db
        .insert(pullRequests)
        .values({
          repo,
          prId: pr.prId,
          title: pr.prTitle,
          description: pr.description,
          state: pr.prState,
          url: pr.prUrl,
          sourceBranch: pr.sourceBranch,
          targetBranch: pr.prTargetBranch,
          authorName: pr.authorName,
          reviewers: JSON.stringify(reviewerNames),
          approvals: pr.prApprovals,
          commentCount: pr.commentCount,
          taskCount: pr.taskCount,
          mergeCommitSha: pr.mergeCommitSha,
          createdAt: pr.prCreatedAt,
          updatedAt: pr.prUpdatedAt,
        })
        .returning({ id: pullRequests.id });
      results.push({ id: row!.id, prId: pr.prId });
    }
  }

  return results;
}

/**
 * Store PR activity events with dedup by (pullRequestId, timestamp, activityType, actorName).
 */
export async function storePRActivities(
  prRowId: number,
  repo: string,
  prId: number,
  activities: PRActivityEntry[]
): Promise<number> {
  if (activities.length === 0) return 0;
  const db = getDb();
  let inserted = 0;

  for (const a of activities) {
    // Dedup check
    const [existing] = await db
      .select({ id: prActivities.id })
      .from(prActivities)
      .where(and(
        eq(prActivities.pullRequestId, prRowId),
        eq(prActivities.timestamp, a.timestamp),
        eq(prActivities.activityType, a.activityType),
        a.actorName ? eq(prActivities.actorName, a.actorName) : sql`${prActivities.actorName} IS NULL`
      ));

    if (!existing) {
      await db.insert(prActivities)
        .values({
          pullRequestId: prRowId,
          repo,
          prId,
          activityType: a.activityType,
          actorName: a.actorName,
          timestamp: a.timestamp,
          newState: a.newState,
          commentText: a.commentText,
          commitHash: a.commitHash,
        });
      inserted++;
    }
  }

  return inserted;
}

/**
 * Find PRs needing activity refresh:
 * - OPEN PRs where lastActivityFetched is older than maxAgeMins
 * - MERGED/DECLINED PRs where lastActivityFetched is null (never fetched)
 */
export async function getStaleActivityPRs(
  repo: string,
  maxAgeMins = 30
): Promise<{ id: number; prId: number; state: string }[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - maxAgeMins * 60_000).toISOString();

  const rows = await db
    .select({ id: pullRequests.id, prId: pullRequests.prId, state: pullRequests.state })
    .from(pullRequests)
    .where(and(
      eq(pullRequests.repo, repo),
      or(
        // OPEN PRs with stale or missing activity
        and(
          eq(pullRequests.state, "OPEN"),
          or(
            sql`${pullRequests.lastActivityFetched} IS NULL`,
            sql`${pullRequests.lastActivityFetched} < ${cutoff}`
          )
        ),
        // MERGED/DECLINED PRs never fetched
        and(
          or(eq(pullRequests.state, "MERGED"), eq(pullRequests.state, "DECLINED")),
          sql`${pullRequests.lastActivityFetched} IS NULL`
        )
      )
    ));

  return rows;
}

/**
 * Compute time to first review (approval/comment/request_changes by non-author).
 * Returns minutes or null.
 */
export async function computeTimeToFirstReview(prRowId: number): Promise<number | null> {
  const db = getDb();
  const [pr] = await db.select({ createdAt: pullRequests.createdAt, authorName: pullRequests.authorName })
    .from(pullRequests).where(eq(pullRequests.id, prRowId));
  if (!pr) return null;

  const [firstReview] = await db
    .select({ timestamp: prActivities.timestamp })
    .from(prActivities)
    .where(and(
      eq(prActivities.pullRequestId, prRowId),
      inArray(prActivities.activityType, ["approval", "comment", "request_changes"]),
      pr.authorName
        ? sql`${prActivities.actorName} != ${pr.authorName}`
        : sql`1=1`
    ))
    .orderBy(asc(prActivities.timestamp))
    .limit(1);

  if (!firstReview) return null;
  const created = new Date(pr.createdAt).getTime();
  const reviewed = new Date(firstReview.timestamp).getTime();
  return Math.round((reviewed - created) / 60_000);
}

/**
 * Compute time to merge: PR createdAt to first MERGED state activity or PR updatedAt if state=MERGED.
 */
export async function computeTimeToMerge(prRowId: number): Promise<number | null> {
  const db = getDb();
  const [pr] = await db.select({ createdAt: pullRequests.createdAt, state: pullRequests.state, updatedAt: pullRequests.updatedAt })
    .from(pullRequests).where(eq(pullRequests.id, prRowId));
  if (!pr || pr.state !== "MERGED") return null;

  // Try to find merge event in activities
  const [mergeActivity] = await db
    .select({ timestamp: prActivities.timestamp })
    .from(prActivities)
    .where(and(
      eq(prActivities.pullRequestId, prRowId),
      eq(prActivities.activityType, "update"),
      eq(prActivities.newState, "MERGED")
    ))
    .orderBy(asc(prActivities.timestamp))
    .limit(1);

  const created = new Date(pr.createdAt).getTime();
  const mergedAt = mergeActivity
    ? new Date(mergeActivity.timestamp).getTime()
    : new Date(pr.updatedAt).getTime();

  return Math.round((mergedAt - created) / 60_000);
}

/**
 * Count review rounds: cycles of request_changes → update (new commits).
 */
export async function computeReviewRounds(prRowId: number): Promise<number> {
  const db = getDb();
  const activities = await db
    .select({ activityType: prActivities.activityType })
    .from(prActivities)
    .where(and(
      eq(prActivities.pullRequestId, prRowId),
      inArray(prActivities.activityType, ["request_changes", "update"])
    ))
    .orderBy(asc(prActivities.timestamp));

  let rounds = 0;
  let sawChangesRequested = false;
  for (const a of activities) {
    if (a.activityType === "request_changes") {
      sawChangesRequested = true;
    } else if (a.activityType === "update" && sawChangesRequested) {
      rounds++;
      sawChangesRequested = false;
    }
  }
  return rounds;
}

/**
 * Compute and cache all PR metrics on the pull_requests row.
 */
export async function computeAndCachePRMetrics(prRowId: number): Promise<void> {
  const db = getDb();
  const ttfr = await computeTimeToFirstReview(prRowId);
  const ttm = await computeTimeToMerge(prRowId);
  const rounds = await computeReviewRounds(prRowId);

  await db.update(pullRequests)
    .set({
      timeToFirstReviewMins: ttfr,
      timeToMergeMins: ttm,
      reviewRounds: rounds,
      lastActivityFetched: new Date().toISOString(),
    })
    .where(eq(pullRequests.id, prRowId));
}

// ── PR Dashboard Queries ──────────────────────────────────────────────────

export interface PRFilter {
  repo?: string;
  state?: string;
  authorName?: string;
  since?: string;
  until?: string;
}

export async function getPullRequestsPaginated(
  filter: PRFilter,
  page: number,
  pageSize: number,
  sort = "updated"
): Promise<{ pullRequests: (typeof pullRequests.$inferSelect)[]; total: number }> {
  const db = getDb();
  const conditions: ReturnType<typeof eq>[] = [];

  if (filter.repo) conditions.push(eq(pullRequests.repo, filter.repo));
  if (filter.state) conditions.push(eq(pullRequests.state, filter.state));
  if (filter.authorName) conditions.push(eq(pullRequests.authorName, filter.authorName));
  if (filter.since) conditions.push(gte(pullRequests.createdAt, filter.since));
  if (filter.until) conditions.push(lte(pullRequests.createdAt, filter.until));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(pullRequests)
    .where(where);
  const total = totalResult?.count ?? 0;

  const sortCol = sort === "created" ? pullRequests.createdAt : pullRequests.updatedAt;
  const offset = (page - 1) * pageSize;
  const rows = await db
    .select()
    .from(pullRequests)
    .where(where)
    .orderBy(desc(sortCol))
    .limit(pageSize)
    .offset(offset);

  return { pullRequests: rows, total };
}

export async function getPullRequestDetail(prRowId: number) {
  const db = getDb();
  const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, prRowId));
  if (!pr) return null;

  const activities = await db
    .select()
    .from(prActivities)
    .where(eq(prActivities.pullRequestId, prRowId))
    .orderBy(asc(prActivities.timestamp));

  // Find linked branch
  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.repo, pr.repo), eq(branches.name, pr.sourceBranch)));

  // Find linked ticket via branch jiraKey
  let ticket: (typeof tickets.$inferSelect) | null = null;
  if (branch?.jiraKey) {
    const [ticketRow] = await db.select().from(tickets).where(eq(tickets.jiraKey, branch.jiraKey));
    ticket = ticketRow ?? null;
  }

  // Find commits on this branch
  const branchCommits = await db
    .select()
    .from(commits)
    .where(and(eq(commits.repo, pr.repo), eq(commits.branch, pr.sourceBranch)))
    .orderBy(desc(commits.timestamp));

  return { pr, activities, branch: branch ?? null, ticket, commits: branchCommits };
}

export async function getPRDashboardStats(repo?: string) {
  const db = getDb();
  const conditions = repo ? [eq(pullRequests.repo, repo)] : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalOpenResult] = await db.select({ count: count() }).from(pullRequests)
    .where(where ? and(where, eq(pullRequests.state, "OPEN")) : eq(pullRequests.state, "OPEN"));
  const totalOpen = totalOpenResult?.count ?? 0;

  const [totalMergedResult] = await db.select({ count: count() }).from(pullRequests)
    .where(where ? and(where, eq(pullRequests.state, "MERGED")) : eq(pullRequests.state, "MERGED"));
  const totalMerged = totalMergedResult?.count ?? 0;

  const [totalDeclinedResult] = await db.select({ count: count() }).from(pullRequests)
    .where(where ? and(where, eq(pullRequests.state, "DECLINED")) : eq(pullRequests.state, "DECLINED"));
  const totalDeclined = totalDeclinedResult?.count ?? 0;

  // Avg time to merge (only merged PRs with non-null metric)
  const mergedWithTTM = await db
    .select({ ttm: pullRequests.timeToMergeMins })
    .from(pullRequests)
    .where(where
      ? and(where, eq(pullRequests.state, "MERGED"), isNotNull(pullRequests.timeToMergeMins))
      : and(eq(pullRequests.state, "MERGED"), isNotNull(pullRequests.timeToMergeMins))
    );
  const avgTimeToMergeHours = mergedWithTTM.length > 0
    ? Math.round(mergedWithTTM.reduce((s, r) => s + (r.ttm ?? 0), 0) / mergedWithTTM.length / 60 * 10) / 10
    : 0;

  // Avg time to first review
  const withTTFR = await db
    .select({ ttfr: pullRequests.timeToFirstReviewMins })
    .from(pullRequests)
    .where(where
      ? and(where, isNotNull(pullRequests.timeToFirstReviewMins))
      : isNotNull(pullRequests.timeToFirstReviewMins)
    );
  const avgTimeToFirstReviewHours = withTTFR.length > 0
    ? Math.round(withTTFR.reduce((s, r) => s + (r.ttfr ?? 0), 0) / withTTFR.length / 60 * 10) / 10
    : 0;

  // Avg review rounds
  const allPRs = await db
    .select({ rounds: pullRequests.reviewRounds })
    .from(pullRequests)
    .where(where);
  const avgReviewRounds = allPRs.length > 0
    ? Math.round(allPRs.reduce((s, r) => s + (r.rounds ?? 0), 0) / allPRs.length * 10) / 10
    : 0;

  // PRs without any review activity
  const allPRIds = (await db
    .select({ id: pullRequests.id })
    .from(pullRequests)
    .where(where))
    .map((r) => r.id);

  let prsWithoutReview = 0;
  if (allPRIds.length > 0) {
    const prsWithActivity = new Set<number>();
    for (let i = 0; i < allPRIds.length; i += SHA_CHUNK_SIZE) {
      const chunk = allPRIds.slice(i, i + SHA_CHUNK_SIZE);
      const rows = await db
        .select({ prId: prActivities.pullRequestId })
        .from(prActivities)
        .where(and(
          inArray(prActivities.pullRequestId, chunk),
          inArray(prActivities.activityType, ["approval", "comment", "request_changes"])
        ))
        .groupBy(prActivities.pullRequestId);
      for (const r of rows) prsWithActivity.add(r.prId);
    }
    prsWithoutReview = allPRIds.length - prsWithActivity.size;
  }

  return { totalOpen, totalMerged, totalDeclined, avgTimeToMergeHours, avgTimeToFirstReviewHours, avgReviewRounds, prsWithoutReview };
}

export async function getReviewerStats(repo?: string) {
  const db = getDb();

  // Get all review-type activities
  const conditions = [
    inArray(prActivities.activityType, ["approval", "comment", "request_changes"]),
  ];
  if (repo) conditions.push(eq(prActivities.repo, repo));

  const activities = await db
    .select({
      actorName: prActivities.actorName,
      activityType: prActivities.activityType,
      pullRequestId: prActivities.pullRequestId,
      timestamp: prActivities.timestamp,
    })
    .from(prActivities)
    .where(and(...conditions));

  // Get PR creation dates for response time calculation
  const prCreatedMap = new Map<number, string>();
  const prIds = [...new Set(activities.map((a) => a.pullRequestId))];
  for (let i = 0; i < prIds.length; i += SHA_CHUNK_SIZE) {
    const chunk = prIds.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select({ id: pullRequests.id, createdAt: pullRequests.createdAt, authorName: pullRequests.authorName })
      .from(pullRequests)
      .where(inArray(pullRequests.id, chunk));
    for (const r of rows) prCreatedMap.set(r.id, r.createdAt);
  }

  // Aggregate per reviewer
  const reviewerAgg = new Map<string, {
    prsReviewed: Set<number>;
    totalApprovals: number;
    totalChangesRequested: number;
    responseTimes: number[];
  }>();

  // Track first review per PR per reviewer
  const firstReviewPerPR = new Map<string, number>(); // "prId|reviewer" -> timestamp_ms

  for (const a of activities) {
    const reviewer = a.actorName ?? "Unknown";
    let agg = reviewerAgg.get(reviewer);
    if (!agg) {
      agg = { prsReviewed: new Set(), totalApprovals: 0, totalChangesRequested: 0, responseTimes: [] };
      reviewerAgg.set(reviewer, agg);
    }
    agg.prsReviewed.add(a.pullRequestId);
    if (a.activityType === "approval") agg.totalApprovals++;
    if (a.activityType === "request_changes") agg.totalChangesRequested++;

    // Track first response time per PR
    const key = `${a.pullRequestId}|${reviewer}`;
    const actTs = new Date(a.timestamp).getTime();
    const existing = firstReviewPerPR.get(key);
    if (!existing || actTs < existing) {
      firstReviewPerPR.set(key, actTs);
    }
  }

  // Calculate avg response times
  for (const [key, ts] of firstReviewPerPR) {
    const [prIdStr, reviewer] = key.split("|");
    if (!prIdStr || !reviewer) continue;
    const prCreated = prCreatedMap.get(Number(prIdStr));
    if (!prCreated) continue;
    const createdMs = new Date(prCreated).getTime();
    const responseMins = Math.round((ts - createdMs) / 60_000);
    if (responseMins >= 0) {
      reviewerAgg.get(reviewer)?.responseTimes.push(responseMins);
    }
  }

  const results: {
    reviewerName: string;
    prsReviewed: number;
    totalApprovals: number;
    totalChangesRequested: number;
    avgResponseTimeMins: number;
  }[] = [];

  for (const [reviewer, agg] of reviewerAgg) {
    const avgResponse = agg.responseTimes.length > 0
      ? Math.round(agg.responseTimes.reduce((s, t) => s + t, 0) / agg.responseTimes.length)
      : 0;
    results.push({
      reviewerName: reviewer,
      prsReviewed: agg.prsReviewed.size,
      totalApprovals: agg.totalApprovals,
      totalChangesRequested: agg.totalChangesRequested,
      avgResponseTimeMins: avgResponse,
    });
  }

  results.sort((a, b) => b.prsReviewed - a.prsReviewed);
  return results;
}

export async function getPRFilters() {
  const db = getDb();
  const repos = (await db
    .select({ repo: pullRequests.repo })
    .from(pullRequests)
    .groupBy(pullRequests.repo))
    .map((r) => r.repo);

  const authors = (await db
    .select({ author: pullRequests.authorName })
    .from(pullRequests)
    .where(isNotNull(pullRequests.authorName))
    .groupBy(pullRequests.authorName))
    .map((r) => r.author!)
    .filter(Boolean);

  const states = (await db
    .select({ state: pullRequests.state })
    .from(pullRequests)
    .groupBy(pullRequests.state))
    .map((r) => r.state);

  return { repos, authors, states };
}

// ── Ticket Status Change Queries ────────────────────────────────────────

export async function upsertTicketStatusChanges(jiraKey: string, changes: StatusChange[]): Promise<void> {
  if (changes.length === 0) return;
  const db = getDb();

  for (const c of changes) {
    // Dedup by (jiraKey, changedAt, toStatus)
    const [existing] = await db
      .select({ id: ticketStatusChanges.id })
      .from(ticketStatusChanges)
      .where(and(
        eq(ticketStatusChanges.jiraKey, jiraKey),
        eq(ticketStatusChanges.changedAt, c.changedAt),
        eq(ticketStatusChanges.toStatus, c.toStatus),
      ));

    if (!existing) {
      await db.insert(ticketStatusChanges)
        .values({
          jiraKey,
          changedAt: c.changedAt,
          fromStatus: c.fromStatus,
          toStatus: c.toStatus,
          changedBy: c.changedBy,
        });
    }
  }
}

export async function getTicketStatusChanges(jiraKey: string) {
  const db = getDb();
  return await db
    .select()
    .from(ticketStatusChanges)
    .where(eq(ticketStatusChanges.jiraKey, jiraKey))
    .orderBy(asc(ticketStatusChanges.changedAt));
}

// ── Analytics Queries ────────────────────────────────────────────────────

export async function getCommitVelocityByMember(since: string, until: string, authorEmails?: string[]) {
  const db = getDb();
  const untilPlusOne = new Date(new Date(until).getTime() + 86_400_000).toISOString().split("T")[0]!;

  const conditions = [
    sql`${commits.timestamp} >= ${since}`,
    sql`${commits.timestamp} < ${untilPlusOne}`,
    TEST_REPO_FILTER,
  ];
  if (authorEmails && authorEmails.length > 0) {
    conditions.push(inArray(commits.authorEmail, authorEmails));
  }

  const rows = await db.execute<{ date: string; authorEmail: string; count: number }>(
    sql`SELECT DATE(${commits.timestamp}) as date, ${commits.authorEmail} as "authorEmail", COUNT(*)::integer as count
        FROM ${commits}
        WHERE ${and(...conditions)}
        GROUP BY DATE(${commits.timestamp}), ${commits.authorEmail}
        ORDER BY date ASC`
  );

  return rows as unknown as { date: string; authorEmail: string; count: number }[];
}

export async function getCodeChurnDaily(since: string, until: string) {
  const db = getDb();
  const untilPlusOne = new Date(new Date(until).getTime() + 86_400_000).toISOString().split("T")[0]!;

  const rows = await db.execute<{
    date: string;
    insertions: number;
    deletions: number;
    filesChanged: number;
    commitCount: number;
  }>(
    sql`SELECT DATE(${commits.timestamp}) as date,
           SUM(${commits.insertions})::integer as insertions,
           SUM(${commits.deletions})::integer as deletions,
           SUM(${commits.filesChanged})::integer as "filesChanged",
           COUNT(*)::integer as "commitCount"
        FROM ${commits}
        WHERE ${commits.timestamp} >= ${since}
          AND ${commits.timestamp} < ${untilPlusOne}
          AND ${commits.repo} != 'test-repo'
        GROUP BY DATE(${commits.timestamp})
        ORDER BY date ASC`
  );

  return rows as unknown as { date: string; insertions: number; deletions: number; filesChanged: number; commitCount: number }[];
}

export async function getPRCycleTimePoints(since?: string, until?: string) {
  const db = getDb();
  const conditions: ReturnType<typeof eq>[] = [
    eq(pullRequests.state, "MERGED"),
    isNotNull(pullRequests.timeToMergeMins),
  ];
  if (since) conditions.push(gte(pullRequests.createdAt, since));
  if (until) conditions.push(lte(pullRequests.createdAt, until));

  return await db
    .select({
      date: pullRequests.createdAt,
      timeToMergeMins: pullRequests.timeToMergeMins,
      timeToFirstReviewMins: pullRequests.timeToFirstReviewMins,
      reviewRounds: pullRequests.reviewRounds,
      repo: pullRequests.repo,
      authorName: pullRequests.authorName,
      prId: pullRequests.prId,
    })
    .from(pullRequests)
    .where(and(...conditions))
    .orderBy(asc(pullRequests.createdAt));
}

// ── Sprint Burndown ────────────────────────────────────────────────────

const DONE_STATUSES = new Set(["Done", "Closed", "Resolved"]);
const IN_REVIEW_STATUSES = new Set(["In Review", "Code Review", "Review"]);
const IN_PROGRESS_STATUSES = new Set(["In Progress", "In Development", "Development"]);

export interface SprintBurndownDay {
  date: string;
  todo: number;
  inProgress: number;
  inReview: number;
  done: number;
  remaining: number;
  commitsToday: number;
}

export async function getSprintBurndown(sprintId: number): Promise<{
  sprint: { name: string; startDate: string | null; endDate: string | null };
  days: SprintBurndownDay[];
  totalTickets: number;
} | null> {
  const db = getDb();
  const sprint = await getSprintById(sprintId);
  if (!sprint || !sprint.startDate || !sprint.endDate) return null;

  const ticketKeys = await getSprintTicketKeys(sprintId);
  if (ticketKeys.length === 0) {
    return {
      sprint: { name: sprint.name, startDate: sprint.startDate, endDate: sprint.endDate },
      days: [],
      totalTickets: 0,
    };
  }

  // Fetch all status changes for sprint tickets
  const statusChangesMap = new Map<string, (typeof ticketStatusChanges.$inferSelect)[]>();
  for (const key of ticketKeys) {
    const changes = await getTicketStatusChanges(key);
    statusChangesMap.set(key, changes);
  }

  // Generate each day in the sprint range
  const startMs = new Date(sprint.startDate).getTime();
  const endMs = new Date(sprint.endDate).getTime();
  const days: SprintBurndownDay[] = [];

  for (let ms = startMs; ms <= endMs; ms += 86_400_000) {
    const date = new Date(ms).toISOString().split("T")[0]!;
    const dayEnd = date + "T23:59:59.999Z";

    let todo = 0;
    let inProgress = 0;
    let inReview = 0;
    let done = 0;

    for (const key of ticketKeys) {
      const changes = statusChangesMap.get(key) ?? [];
      // Find the latest status change <= dayEnd
      let latestStatus: string | null = null;
      for (const c of changes) {
        if (c.changedAt <= dayEnd) {
          latestStatus = c.toStatus;
        }
      }

      if (latestStatus === null) {
        // No status changes recorded — assume "To Do"
        todo++;
      } else if (DONE_STATUSES.has(latestStatus)) {
        done++;
      } else if (IN_REVIEW_STATUSES.has(latestStatus)) {
        inReview++;
      } else if (IN_PROGRESS_STATUSES.has(latestStatus)) {
        inProgress++;
      } else {
        todo++;
      }
    }

    // Count commits for this day
    const dailyCounts = await getDailyCommitCounts(date, date);
    const commitsToday = dailyCounts.length > 0 ? dailyCounts[0]!.count : 0;

    days.push({
      date,
      todo,
      inProgress,
      inReview,
      done,
      remaining: ticketKeys.length - done,
      commitsToday,
    });
  }

  return {
    sprint: { name: sprint.name, startDate: sprint.startDate, endDate: sprint.endDate },
    days,
    totalTickets: ticketKeys.length,
  };
}

// ── Sprint Summary Queries ──────────────────────────────────────────────

export async function storeSprintSummary(params: {
  sprintId: number;
  runId?: number;
  technicalSummary: string;
  generalSummary: string;
  statsJson?: string;
  reportPath?: string;
  sessionId?: string;
}): Promise<number> {
  const db = getDb();

  // Upsert: delete existing for this sprint, then insert
  await db.delete(sprintSummaries)
    .where(eq(sprintSummaries.sprintId, params.sprintId));

  const [result] = await db
    .insert(sprintSummaries)
    .values({
      sprintId: params.sprintId,
      runId: params.runId ?? null,
      technicalSummary: params.technicalSummary,
      generalSummary: params.generalSummary,
      statsJson: params.statsJson ?? null,
      reportPath: params.reportPath ?? null,
      sessionId: params.sessionId ?? null,
      createdAt: new Date().toISOString(),
    })
    .returning({ id: sprintSummaries.id });
  return result!.id;
}

export async function getSprintSummary(sprintId: number) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(sprintSummaries)
    .where(eq(sprintSummaries.sprintId, sprintId));
  return row;
}

export async function getAllSprintSummaries() {
  const db = getDb();
  return await db
    .select()
    .from(sprintSummaries)
    .orderBy(desc(sprintSummaries.createdAt));
}

export async function getSprintMemberContributions(
  sprintId: number,
  team: { name: string; emails: string[] }[]
): Promise<{ name: string; commitCount: number; ticketCount: number; prsMerged: number }[]> {
  const db = getDb();
  const sprint = await getSprintById(sprintId);
  if (!sprint) return [];

  const ticketKeys = await getSprintTicketKeys(sprintId);
  const keySet = new Set(ticketKeys);

  // Get all commits in sprint date range
  const conditions = [TEST_REPO_FILTER];
  if (sprint.startDate) conditions.push(gte(commits.timestamp, sprint.startDate));
  if (sprint.endDate) {
    const endPlusOne = new Date(new Date(sprint.endDate).getTime() + 86_400_000).toISOString();
    conditions.push(lte(commits.timestamp, endPlusOne));
  }

  const allCommits = await db
    .select()
    .from(commits)
    .where(and(...conditions));

  // Filter to sprint-related commits
  const sprintCommits = allCommits.filter((c) => {
    if (!c.jiraKeys) return false;
    return c.jiraKeys.split(",").some((k) => keySet.has(k.trim()));
  });

  const results = [];
  for (const member of team) {
    const memberCommits = sprintCommits.filter((c) =>
      member.emails.includes(c.authorEmail)
    );

    // Count distinct tickets worked on
    const memberTickets = new Set<string>();
    for (const c of memberCommits) {
      if (c.jiraKeys) {
        for (const k of c.jiraKeys.split(",")) {
          const trimmed = k.trim();
          if (keySet.has(trimmed)) memberTickets.add(trimmed);
        }
      }
    }

    // Count merged PRs by this member in sprint date range
    const prConditions: ReturnType<typeof eq>[] = [eq(pullRequests.state, "MERGED")];
    if (sprint.startDate) prConditions.push(gte(pullRequests.updatedAt, sprint.startDate));
    if (sprint.endDate) {
      const endPlusOne = new Date(new Date(sprint.endDate).getTime() + 86_400_000).toISOString();
      prConditions.push(lte(pullRequests.updatedAt, endPlusOne));
    }

    // Match by author name (find team member's PR author name from their commits)
    const authorNames = [...new Set(memberCommits.map((c) => c.authorName))];
    let prsMerged = 0;
    if (authorNames.length > 0) {
      for (const authorName of authorNames) {
        const [prCount] = await db
          .select({ count: count() })
          .from(pullRequests)
          .where(and(...prConditions, eq(pullRequests.authorName, authorName)));
        prsMerged += prCount?.count ?? 0;
      }
    }

    results.push({
      name: member.name,
      commitCount: memberCommits.length,
      ticketCount: memberTickets.size,
      prsMerged,
    });
  }
  return results;
}

// ── Standup Queries ─────────────────────────────────────────────────────

export interface StandupMemberData {
  member: { name: string; emails: string[] };
  yesterday: {
    commits: (typeof commits.$inferSelect)[];
    ticketsMoved: { jiraKey: string; summary: string | null; fromStatus: string; toStatus: string }[];
    prsMerged: { prId: number; title: string; repo: string }[];
    summaries: { jiraKey: string; summaryText: string }[];
  };
  today: {
    activeBranches: { name: string; repo: string; jiraKey: string | null; prState: string | null }[];
    activeTickets: { jiraKey: string; summary: string | null; status: string }[];
    openPRs: { prId: number; title: string; repo: string; createdAt: string }[];
  };
  blockers: {
    stalePRs: { prId: number; title: string; repo: string; ageHours: number }[];
    idleTickets: { jiraKey: string; summary: string | null; idleDays: number }[];
  };
}

export async function getStandupData(
  team: { name: string; emails: string[] }[],
  date: string
): Promise<StandupMemberData[]> {
  const db = getDb();
  const now = Date.now();

  // Yesterday = date - 1 day
  const dateMs = new Date(date + "T00:00:00Z").getTime();
  const yesterdayDate = new Date(dateMs - 86_400_000).toISOString().split("T")[0]!;

  const results: StandupMemberData[] = [];
  for (const member of team) {
    if (member.emails.length === 0) {
      results.push({
        member,
        yesterday: { commits: [], ticketsMoved: [], prsMerged: [], summaries: [] },
        today: { activeBranches: [], activeTickets: [], openPRs: [] },
        blockers: { stalePRs: [], idleTickets: [] },
      });
      continue;
    }

    // ── Yesterday ──────────────────────────────────────────────────
    const nextDay = new Date(new Date(yesterdayDate).getTime() + 86_400_000).toISOString().split("T")[0]!;
    const yesterdayCommits = await db
      .select()
      .from(commits)
      .where(and(
        inArray(commits.authorEmail, member.emails),
        gte(commits.timestamp, yesterdayDate),
        lte(commits.timestamp, nextDay + "T00:00:00.000Z"),
        TEST_REPO_FILTER,
      ))
      .orderBy(desc(commits.timestamp));

    // Tickets moved yesterday (status changes)
    const ticketsMoved: StandupMemberData["yesterday"]["ticketsMoved"] = [];
    const yesterdayChanges = await db
      .select()
      .from(ticketStatusChanges)
      .where(and(
        gte(ticketStatusChanges.changedAt, yesterdayDate),
        lte(ticketStatusChanges.changedAt, nextDay + "T00:00:00.000Z"),
      ));

    // Filter to tickets the member worked on (via commits)
    const memberTicketKeys = new Set<string>();
    for (const c of yesterdayCommits) {
      if (c.jiraKeys) {
        for (const k of c.jiraKeys.split(",")) memberTicketKeys.add(k.trim());
      }
    }
    // Also check branch jiraKeys
    const memberBranches = await db
      .select()
      .from(branches)
      .where(and(
        inArray(branches.authorEmail, member.emails),
        eq(branches.isActive, 1),
        sql`${branches.repo} != 'test-repo'`,
      ));
    for (const b of memberBranches) {
      if (b.jiraKey) memberTicketKeys.add(b.jiraKey);
    }

    for (const change of yesterdayChanges) {
      if (memberTicketKeys.has(change.jiraKey)) {
        const [ticket] = await db.select({ summary: tickets.summary }).from(tickets)
          .where(eq(tickets.jiraKey, change.jiraKey));
        ticketsMoved.push({
          jiraKey: change.jiraKey,
          summary: ticket?.summary ?? null,
          fromStatus: change.fromStatus ?? "?",
          toStatus: change.toStatus,
        });
      }
    }

    // PRs merged yesterday
    const prsMerged: StandupMemberData["yesterday"]["prsMerged"] = [];
    // Find author names from commits
    const authorNames = [...new Set(
      (await db.select({ authorName: commits.authorName })
        .from(commits)
        .where(inArray(commits.authorEmail, member.emails))
        .groupBy(commits.authorName))
        .map((r) => r.authorName)
    )];

    if (authorNames.length > 0) {
      for (const authorName of authorNames) {
        const merged = await db
          .select({ prId: pullRequests.prId, title: pullRequests.title, repo: pullRequests.repo })
          .from(pullRequests)
          .where(and(
            eq(pullRequests.state, "MERGED"),
            eq(pullRequests.authorName, authorName),
            gte(pullRequests.updatedAt, yesterdayDate),
            lte(pullRequests.updatedAt, nextDay + "T00:00:00.000Z"),
          ));
        prsMerged.push(...merged);
      }
    }

    // Yesterday's ticket summaries
    const summaries: StandupMemberData["yesterday"]["summaries"] = [];
    if (memberTicketKeys.size > 0) {
      const keys = [...memberTicketKeys];
      const latestSummaries = await getTicketSummariesByKeys(keys);
      for (const ts of latestSummaries) {
        summaries.push({ jiraKey: ts.jiraKey, summaryText: ts.summaryText });
      }
    }

    // ── Today ──────────────────────────────────────────────────────

    // Active tickets: in progress/in review that the member has commits on
    const inProgressStatuses = ["In Progress", "In Development", "Development", "In Review", "Code Review", "Review"];
    const activeTickets: StandupMemberData["today"]["activeTickets"] = [];
    const activeTicketKeySet = new Set<string>();

    if (memberTicketKeys.size > 0) {
      const keys = [...memberTicketKeys];
      const ticketRows = await getTicketsByKeys(keys);
      for (const t of ticketRows) {
        if (t.status && inProgressStatuses.includes(t.status)) {
          activeTickets.push({ jiraKey: t.jiraKey, summary: t.summary, status: t.status });
          activeTicketKeySet.add(t.jiraKey);
        }
      }
    }

    // Only show branches tied to an active ticket or with an open PR — not every branch
    const activeBranches: StandupMemberData["today"]["activeBranches"] = memberBranches
      .filter((b) => {
        if (b.prState === "OPEN") return true;
        if (b.jiraKey && activeTicketKeySet.has(b.jiraKey)) return true;
        return false;
      })
      .map((b) => ({
        name: b.name,
        repo: b.repo,
        jiraKey: b.jiraKey,
        prState: b.prState,
      }));

    // Open PRs
    const openPRs: StandupMemberData["today"]["openPRs"] = [];
    if (authorNames.length > 0) {
      for (const authorName of authorNames) {
        const prs = await db
          .select({ prId: pullRequests.prId, title: pullRequests.title, repo: pullRequests.repo, createdAt: pullRequests.createdAt })
          .from(pullRequests)
          .where(and(eq(pullRequests.state, "OPEN"), eq(pullRequests.authorName, authorName)));
        openPRs.push(...prs);
      }
    }

    // ── Blockers ────────────────────────────────────────────────────
    // Stale PRs: open > 48h with no review activity
    const stalePRs: StandupMemberData["blockers"]["stalePRs"] = [];
    for (const pr of openPRs) {
      const ageHours = Math.round((now - new Date(pr.createdAt).getTime()) / 3_600_000);
      if (ageHours > 48) {
        stalePRs.push({ prId: pr.prId, title: pr.title, repo: pr.repo, ageHours });
      }
    }

    // Idle tickets: tickets member is working on with no commits > 3 days
    const idleTickets: StandupMemberData["blockers"]["idleTickets"] = [];
    const threeDaysAgo = new Date(now - 3 * 86_400_000).toISOString();
    for (const at of activeTickets) {
      // Check last commit date for this ticket
      const [lastCommit] = await db
        .select({ timestamp: commits.timestamp })
        .from(commits)
        .where(and(
          like(commits.jiraKeys, `%${at.jiraKey}%`),
          TEST_REPO_FILTER,
        ))
        .orderBy(desc(commits.timestamp))
        .limit(1);

      if (lastCommit && lastCommit.timestamp < threeDaysAgo) {
        const idleDays = Math.round((now - new Date(lastCommit.timestamp).getTime()) / 86_400_000);
        idleTickets.push({ jiraKey: at.jiraKey, summary: at.summary, idleDays });
      }
    }

    results.push({
      member,
      yesterday: { commits: yesterdayCommits, ticketsMoved, prsMerged, summaries },
      today: { activeBranches, activeTickets, openPRs },
      blockers: { stalePRs, idleTickets },
    });
  }
  return results;
}
