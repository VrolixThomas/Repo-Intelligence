import { eq, desc, isNotNull, and, inArray, count, sql, or, lt, like, gte, lte, asc } from "drizzle-orm";
import { getDb } from "./index";
import { runs, commits, branches, tickets, ticketSummaries, sprints, sprintTickets, sprintSummaries, pullRequests, prActivities, ticketStatusChanges } from "./schema";
import type { CommitInfo, BranchInfo } from "../git/scanner";
import type { TicketData, StatusChange } from "../jira/tickets";
import type { PullRequestData, PullRequestFullData } from "../bitbucket/pullrequests";
import type { PRActivityEntry } from "../bitbucket/pr-activity";

// ── Query Options (lite mode excludes heavy text columns) ────────────────────

export interface QueryOpts { lite?: boolean; noRelations?: boolean; }

const TICKET_LITE_COLS = {
  id: tickets.id, jiraKey: tickets.jiraKey, summary: tickets.summary,
  description: tickets.description, status: tickets.status, assignee: tickets.assignee,
  priority: tickets.priority, ticketType: tickets.ticketType, parentKey: tickets.parentKey,
  subtasks: tickets.subtasks, labels: tickets.labels,
  lastFetched: tickets.lastFetched, lastJiraUpdated: tickets.lastJiraUpdated,
  // EXCLUDED: commentsJson, dataJson
} as const;

const COMMIT_LITE_COLS = {
  id: commits.id, sha: commits.sha, shortSha: commits.shortSha,
  repo: commits.repo, branch: commits.branch,
  authorName: commits.authorName, authorEmail: commits.authorEmail,
  message: commits.message, timestamp: commits.timestamp,
  filesChanged: commits.filesChanged, insertions: commits.insertions, deletions: commits.deletions,
  firstSeenRun: commits.firstSeenRun, jiraKeys: commits.jiraKeys,
  // EXCLUDED: diffSummary
} as const;

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

  const newCommits = commitInfos.filter((c) => !existingShas.has(c.sha));
  const existingCount = commitInfos.length - newCommits.length;

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

  // Step 2: Collect existing branch names for new/updated classification
  const existingRows = await db
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.repo, repoName));
  const existingNames = new Set(existingRows.map((r) => r.name));

  // Pre-compute jiraKey for each branch
  const branchesWithKeys = branchInfos.map((b) => {
    const jiraMatch = b.name.match(/([A-Z][A-Z0-9]+-(?!0+\b)\d+)/);
    return { ...b, jiraKey: jiraMatch ? jiraMatch[1]! : null };
  });

  // Step 3: Upsert all branches with onConflictDoUpdate
  const values = branchesWithKeys.map((b) => ({
    repo: repoName,
    name: b.name,
    authorEmail: b.lastCommitAuthorEmail,
    firstSeen: now,
    lastSeen: now,
    lastCommitSha: b.lastCommitSha,
    lastCommitDate: b.lastCommitDate,
    isActive: 1,
    jiraKey: b.jiraKey,
  }));

  if (values.length > 0) {
    for (let i = 0; i < values.length; i += SHA_CHUNK_SIZE) {
      const chunk = values.slice(i, i + SHA_CHUNK_SIZE);
      await db.insert(branches).values(chunk).onConflictDoUpdate({
        target: [branches.repo, branches.name],
        set: {
          lastSeen: sql`excluded.last_seen`,
          lastCommitSha: sql`excluded.last_commit_sha`,
          lastCommitDate: sql`excluded.last_commit_date`,
          authorEmail: sql`excluded.author_email`,
          isActive: sql`excluded.is_active`,
          jiraKey: sql`excluded.jira_key`,
          // Don't update firstSeen — preserve original
        },
      });
    }
  }

  // Classify new vs updated based on pre-existing names
  const newBranches = branchesWithKeys.filter((b) => !existingNames.has(b.name)).map((b) => b.name);
  const updatedBranches = branchesWithKeys.filter((b) => existingNames.has(b.name)).map((b) => b.name);

  // Step 4: Find branches that are still inactive (gone from remote)
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

export async function getCommitsForRun(runId: number, opts?: QueryOpts) {
  const db = getDb();
  return await (opts?.lite ? db.select(COMMIT_LITE_COLS) : db.select())
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

export async function getStaleTicketKeys(jiraKeys: string[], maxAgeMinutes = 60): Promise<string[]> {
  if (jiraKeys.length === 0) return [];

  const db = getDb();
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString();

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

export async function upsertTickets(ticketData: TicketData[]): Promise<void> {
  if (ticketData.length === 0) return;

  const db = getDb();
  const now = new Date().toISOString();

  const values = ticketData.map((t) => ({
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
  }));

  for (let i = 0; i < values.length; i += SHA_CHUNK_SIZE) {
    const chunk = values.slice(i, i + SHA_CHUNK_SIZE);
    await db.insert(tickets).values(chunk).onConflictDoUpdate({
      target: tickets.jiraKey,
      set: {
        summary: sql`excluded.summary`,
        description: sql`excluded.description`,
        status: sql`excluded.status`,
        assignee: sql`excluded.assignee`,
        priority: sql`excluded.priority`,
        ticketType: sql`excluded.ticket_type`,
        parentKey: sql`excluded.parent_key`,
        subtasks: sql`excluded.subtasks`,
        labels: sql`excluded.labels`,
        commentsJson: sql`excluded.comments_json`,
        lastFetched: sql`excluded.last_fetched`,
        lastJiraUpdated: sql`excluded.last_jira_updated`,
        dataJson: sql`excluded.data_json`,
      },
    });
  }

  // Batch upsert all status changes across all tickets in one pass
  await upsertTicketStatusChangesBatch(ticketData);
}

export async function getTicketsByKeys(jiraKeys: string[], opts?: QueryOpts) {
  if (jiraKeys.length === 0) return [];

  const db = getDb();
  const results: any[] = [];

  for (let i = 0; i < jiraKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = jiraKeys.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await (opts?.lite ? db.select(TICKET_LITE_COLS) : db.select())
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

export async function getTicketSummariesByKey(jiraKey: string) {
  const db = getDb();
  return await db
    .select()
    .from(ticketSummaries)
    .where(eq(ticketSummaries.jiraKey, jiraKey))
    .orderBy(desc(ticketSummaries.id));
}

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
  pageSize: number,
  opts?: QueryOpts
): Promise<{ commits: any[]; total: number }> {
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
  const rows = await (opts?.lite ? db.select(COMMIT_LITE_COLS) : db.select())
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

export async function getAllMemberStats(
  team: { name: string; emails: string[] }[]
): Promise<{ name: string; emails: string[]; commitCount: number; activeBranchCount: number; lastActivity: string | null }[]> {
  const db = getDb();
  const allEmails = team.flatMap((m) => m.emails).filter((e) => e);
  if (allEmails.length === 0) {
    return team.map((m) => ({ name: m.name, emails: m.emails, commitCount: 0, activeBranchCount: 0, lastActivity: null }));
  }

  // Batch: commit counts per email
  const commitCountRows = await db
    .select({ email: commits.authorEmail, count: count() })
    .from(commits)
    .where(and(inArray(commits.authorEmail, allEmails), TEST_REPO_FILTER))
    .groupBy(commits.authorEmail);
  const commitCounts = new Map(commitCountRows.map((r) => [r.email, r.count]));

  // Batch: active branch counts per email
  const branchCountRows = await db
    .select({ email: branches.authorEmail, count: count() })
    .from(branches)
    .where(and(
      inArray(branches.authorEmail, allEmails),
      eq(branches.isActive, 1),
      sql`${branches.repo} != 'test-repo'`,
    ))
    .groupBy(branches.authorEmail);
  const branchCounts = new Map(branchCountRows.map((r) => [r.email, r.count]));

  // Batch: last activity per email
  const lastActivityRows = await db
    .select({ email: commits.authorEmail, lastTs: sql<string>`MAX(${commits.timestamp})` })
    .from(commits)
    .where(and(inArray(commits.authorEmail, allEmails), TEST_REPO_FILTER))
    .groupBy(commits.authorEmail);
  const lastActivities = new Map(lastActivityRows.map((r) => [r.email, r.lastTs]));

  return team.map((m) => {
    let commitCount = 0;
    let activeBranchCount = 0;
    let lastActivity: string | null = null;
    for (const email of m.emails) {
      commitCount += commitCounts.get(email) ?? 0;
      activeBranchCount += branchCounts.get(email) ?? 0;
      const la = lastActivities.get(email);
      if (la && (!lastActivity || la > lastActivity)) lastActivity = la;
    }
    return { name: m.name, emails: m.emails, commitCount, activeBranchCount, lastActivity };
  });
}

export async function getMemberCommits(
  emails: string[],
  page: number,
  pageSize: number,
  opts?: QueryOpts
): Promise<{ commits: any[]; total: number }> {
  if (emails.length === 0) return { commits: [], total: 0 };
  const db = getDb();

  const [totalResult] = await db
    .select({ count: count() })
    .from(commits)
    .where(and(inArray(commits.authorEmail, emails), TEST_REPO_FILTER));
  const total = totalResult?.count ?? 0;

  const offset = (page - 1) * pageSize;
  const rows = await (opts?.lite ? db.select(COMMIT_LITE_COLS) : db.select())
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
  // Find ticket summaries where any of the emails appear in authorEmails — single query with OR
  const likeConditions = emails.map((email) => like(ticketSummaries.authorEmails, `%${email}%`));
  const rows = await db
    .select()
    .from(ticketSummaries)
    .where(or(...likeConditions))
    .orderBy(desc(ticketSummaries.createdAt))
    .limit(limit * emails.length); // fetch enough to dedup

  const seen = new Set<number>();
  return rows
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
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

  // Use LIKE queries to count commits per ticket key instead of loading all commits
  const counts: Record<string, number> = {};
  for (let i = 0; i < jiraKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = jiraKeys.slice(i, i + SHA_CHUNK_SIZE);
    const likeConditions = chunk.map((key) => like(commits.jiraKeys, `%${key}%`));
    const rows = await db
      .select({ jiraKeys: commits.jiraKeys })
      .from(commits)
      .where(and(isNotNull(commits.jiraKeys), or(...likeConditions)));

    const keySet = new Set(chunk);
    for (const row of rows) {
      if (!row.jiraKeys) continue;
      for (const key of row.jiraKeys.split(",")) {
        const trimmed = key.trim();
        if (keySet.has(trimmed)) {
          counts[trimmed] = (counts[trimmed] ?? 0) + 1;
        }
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

export async function getReferencedTicketsGrouped(opts?: QueryOpts): Promise<Record<string, any[]>> {
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

  const keyArray = [...referencedKeys];
  const ticketRows: any[] = [];
  for (let i = 0; i < keyArray.length; i += SHA_CHUNK_SIZE) {
    const chunk = keyArray.slice(i, i + SHA_CHUNK_SIZE);
    const found = await (opts?.lite ? db.select(TICKET_LITE_COLS) : db.select())
      .from(tickets)
      .where(inArray(tickets.jiraKey, chunk));
    ticketRows.push(...found);
  }

  const grouped: Record<string, any[]> = {};
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
}, opts?: QueryOpts): Promise<BranchWithCommitsResult[]> {
  const db = getDb();

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

  if (branchRows.length === 0) return [];

  // Batch fetch all commits for these branches using OR conditions (chunked)
  const branchPairs = branchRows.map((b) => ({ repo: b.repo, name: b.name }));
  const allCommits: any[] = [];
  for (let i = 0; i < branchPairs.length; i += SHA_CHUNK_SIZE) {
    const chunk = branchPairs.slice(i, i + SHA_CHUNK_SIZE);
    const orConditions = chunk.map((bp) => and(eq(commits.repo, bp.repo), eq(commits.branch, bp.name)));
    const rows = await (opts?.lite ? db.select(COMMIT_LITE_COLS) : db.select())
      .from(commits)
      .where(or(...orConditions))
      .orderBy(desc(commits.timestamp));
    allCommits.push(...rows);
  }

  // Index commits by repo::branch
  const commitsByBranch = new Map<string, any[]>();
  for (const c of allCommits) {
    const key = `${c.repo}::${c.branch}`;
    let arr = commitsByBranch.get(key);
    if (!arr) { arr = []; commitsByBranch.set(key, arr); }
    arr.push(c);
  }

  // Batch fetch all tickets by jiraKey
  const jiraKeys = [...new Set(branchRows.map((b) => b.jiraKey).filter((k): k is string => !!k))];
  const ticketMap = new Map<string, any>();
  if (jiraKeys.length > 0) {
    for (let i = 0; i < jiraKeys.length; i += SHA_CHUNK_SIZE) {
      const chunk = jiraKeys.slice(i, i + SHA_CHUNK_SIZE);
      const ticketRows = await (opts?.lite ? db.select(TICKET_LITE_COLS) : db.select()).from(tickets).where(inArray(tickets.jiraKey, chunk));
      for (const t of ticketRows) ticketMap.set(t.jiraKey, t);
    }
  }

  return branchRows.map((branch) => ({
    branch,
    branchCommits: commitsByBranch.get(`${branch.repo}::${branch.name}`) ?? [],
    ticket: branch.jiraKey ? ticketMap.get(branch.jiraKey) ?? null : null,
  }));
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

  const values = data.map((s) => ({
    jiraSprintId: s.jiraSprintId,
    boardId: s.boardId,
    name: s.name,
    state: s.state,
    startDate: s.startDate,
    endDate: s.endDate,
    goal: s.goal,
    lastFetched: now,
  }));

  for (let i = 0; i < values.length; i += SHA_CHUNK_SIZE) {
    const chunk = values.slice(i, i + SHA_CHUNK_SIZE);
    await db.insert(sprints).values(chunk).onConflictDoUpdate({
      target: sprints.jiraSprintId,
      set: {
        name: sql`excluded.name`,
        state: sql`excluded.state`,
        startDate: sql`excluded.start_date`,
        endDate: sql`excluded.end_date`,
        goal: sql`excluded.goal`,
        lastFetched: sql`excluded.last_fetched`,
      },
    });
  }
}

export async function upsertSprintTickets(sprintId: number, jiraKeys: string[]): Promise<void> {
  if (jiraKeys.length === 0) return;
  const db = getDb();

  const values = jiraKeys.map((key) => ({ sprintId, jiraKey: key }));
  for (let i = 0; i < values.length; i += SHA_CHUNK_SIZE) {
    const chunk = values.slice(i, i + SHA_CHUNK_SIZE);
    await db.insert(sprintTickets).values(chunk).onConflictDoNothing({
      target: [sprintTickets.sprintId, sprintTickets.jiraKey],
    });
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

export async function getSprintTickets(sprintId: number, opts?: QueryOpts) {
  const db = getDb();
  const keys = await getSprintTicketKeys(sprintId);
  if (keys.length === 0) return [];

  const results: any[] = [];
  for (let i = 0; i < keys.length; i += SHA_CHUNK_SIZE) {
    const chunk = keys.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await (opts?.lite ? db.select(TICKET_LITE_COLS) : db.select())
      .from(tickets)
      .where(inArray(tickets.jiraKey, chunk));
    results.push(...rows);
  }
  return results;
}

// ── Sprint-Scoped Queries ───────────────────────────────────────────────────

export async function getSprintCommits(sprintId: number, opts?: QueryOpts) {
  const db = getDb();
  const sprint = await getSprintById(sprintId);
  if (!sprint) return [];

  const ticketKeys = await getSprintTicketKeys(sprintId);
  if (ticketKeys.length === 0) return [];

  // Get commits that reference any of the sprint's ticket keys
  // within the sprint date range
  const conditions = [TEST_REPO_FILTER, isNotNull(commits.jiraKeys)];
  if (sprint.startDate) conditions.push(gte(commits.timestamp, sprint.startDate));
  if (sprint.endDate) {
    // Add 1 day to end date to include commits on the last day
    const endPlusOne = new Date(new Date(sprint.endDate).getTime() + 86_400_000).toISOString();
    conditions.push(lte(commits.timestamp, endPlusOne));
  }

  // SQL LIKE pre-filter: narrow result set at DB level before JS post-filter
  // LIKE '%PI-25%' can false-match PI-250 etc, so the JS keySet.has() filter stays
  const likeConditions = ticketKeys.map((key) => like(commits.jiraKeys, `%${key}%`));
  conditions.push(or(...likeConditions)!);

  const filteredCommits = await (opts?.lite ? db.select(COMMIT_LITE_COLS) : db.select())
    .from(commits)
    .where(and(...conditions))
    .orderBy(desc(commits.timestamp));

  // Post-filter for exact key match (LIKE can false-match shorter keys)
  const keySet = new Set(ticketKeys);
  return filteredCommits.filter((c: any) => {
    if (!c.jiraKeys) return false;
    return c.jiraKeys.split(",").some((k: string) => keySet.has(k.trim()));
  });
}

export async function getSprintBranches(sprintId: number, opts?: QueryOpts): Promise<BranchWithCommitsResult[]> {
  const db = getDb();
  const ticketKeys = await getSprintTicketKeys(sprintId);
  if (ticketKeys.length === 0) return [];

  const keySet = new Set(ticketKeys);

  // Fetch branches with sprint ticket keys using IN clause
  const allBranchRows: (typeof branches.$inferSelect)[] = [];
  for (let i = 0; i < ticketKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = ticketKeys.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select()
      .from(branches)
      .where(and(
        sql`${branches.repo} != 'test-repo'`,
        eq(branches.isActive, 1),
        inArray(branches.jiraKey, chunk),
      ))
      .orderBy(desc(branches.lastSeen));
    allBranchRows.push(...rows);
  }

  if (allBranchRows.length === 0) return [];

  // When noRelations is set, skip expensive commit/ticket batch-fetches
  if (opts?.noRelations) {
    return allBranchRows.map((branch) => ({ branch, branchCommits: [], ticket: null }));
  }

  // Batch fetch all commits for these branches
  const branchPairs = allBranchRows.map((b) => ({ repo: b.repo, name: b.name }));
  const allCommits: any[] = [];
  for (let i = 0; i < branchPairs.length; i += SHA_CHUNK_SIZE) {
    const chunk = branchPairs.slice(i, i + SHA_CHUNK_SIZE);
    const orConditions = chunk.map((bp) => and(eq(commits.repo, bp.repo), eq(commits.branch, bp.name)));
    const rows = await (opts?.lite ? db.select(COMMIT_LITE_COLS) : db.select()).from(commits).where(or(...orConditions)).orderBy(desc(commits.timestamp));
    allCommits.push(...rows);
  }

  const commitsByBranch = new Map<string, any[]>();
  for (const c of allCommits) {
    const key = `${c.repo}::${c.branch}`;
    let arr = commitsByBranch.get(key);
    if (!arr) { arr = []; commitsByBranch.set(key, arr); }
    arr.push(c);
  }

  // Batch fetch all tickets
  const jiraKeys = [...new Set(allBranchRows.map((b) => b.jiraKey).filter((k): k is string => !!k))];
  const ticketMap = new Map<string, any>();
  if (jiraKeys.length > 0) {
    for (let i = 0; i < jiraKeys.length; i += SHA_CHUNK_SIZE) {
      const chunk = jiraKeys.slice(i, i + SHA_CHUNK_SIZE);
      const ticketRows = await (opts?.lite ? db.select(TICKET_LITE_COLS) : db.select()).from(tickets).where(inArray(tickets.jiraKey, chunk));
      for (const t of ticketRows) ticketMap.set(t.jiraKey, t);
    }
  }

  return allBranchRows.map((branch) => ({
    branch,
    branchCommits: commitsByBranch.get(`${branch.repo}::${branch.name}`) ?? [],
    ticket: branch.jiraKey ? ticketMap.get(branch.jiraKey) ?? null : null,
  }));
}

// ── Daily Activity Queries ──────────────────────────────────────────────────

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
  date: string,
  opts?: QueryOpts
): Promise<EnrichedDailyActivity[]> {
  const db = getDb();
  const nextDate = new Date(new Date(date).getTime() + 86_400_000).toISOString().split("T")[0]!;

  // 1. Batch fetch ALL team member commits for this day in one query
  const allEmails = team.flatMap((m) => m.emails).filter((e) => e);
  if (allEmails.length === 0) {
    return team.map((member) => ({ member, commits: [], branches: [], tickets: [], ticketSummaries: [] }));
  }

  const allDayCommits = await (opts?.lite ? db.select(COMMIT_LITE_COLS) : db.select())
    .from(commits)
    .where(and(
      inArray(commits.authorEmail, allEmails),
      gte(commits.timestamp, date),
      lte(commits.timestamp, nextDate + "T00:00:00.000Z"),
      TEST_REPO_FILTER,
    ))
    .orderBy(desc(commits.timestamp));

  // Index commits by email
  const commitsByEmail = new Map<string, any[]>();
  for (const c of allDayCommits) {
    let arr = commitsByEmail.get(c.authorEmail);
    if (!arr) { arr = []; commitsByEmail.set(c.authorEmail, arr); }
    arr.push(c);
  }

  // 2. Collect all unique branch keys and batch fetch branch rows
  const allBranchKeys = new Set<string>();
  for (const c of allDayCommits) {
    allBranchKeys.add(`${c.repo}::${c.branch}`);
  }
  const branchPairs = [...allBranchKeys].map((k) => {
    const [repo, name] = k.split("::");
    return { repo: repo!, name: name! };
  }).filter((bp) => bp.repo && bp.name);

  const branchMap = new Map<string, typeof branches.$inferSelect>();
  if (branchPairs.length > 0) {
    for (let i = 0; i < branchPairs.length; i += SHA_CHUNK_SIZE) {
      const chunk = branchPairs.slice(i, i + SHA_CHUNK_SIZE);
      const orConds = chunk.map((bp) => and(eq(branches.repo, bp.repo), eq(branches.name, bp.name)));
      const rows = await db.select().from(branches).where(or(...orConds));
      for (const r of rows) branchMap.set(`${r.repo}::${r.name}`, r);
    }
  }

  // 3. Collect ALL ticket keys (from commits + branches) and batch fetch tickets
  const allTicketKeySet = new Set<string>();
  for (const c of allDayCommits) {
    if (c.jiraKeys) {
      for (const k of c.jiraKeys.split(",")) allTicketKeySet.add(k.trim());
    }
  }
  for (const b of branchMap.values()) {
    if (b.jiraKey) allTicketKeySet.add(b.jiraKey);
  }
  const allTicketKeys = [...allTicketKeySet];
  const ticketMap = new Map<string, any>();
  if (allTicketKeys.length > 0) {
    const ticketRows = await getTicketsByKeys(allTicketKeys, opts);
    for (const t of ticketRows) ticketMap.set(t.jiraKey, t);
  }

  // 4. Batch fetch all ticket summaries for all ticket keys
  const allCandidateSummaries = allTicketKeys.length > 0 ? await getTicketSummariesByKeys(allTicketKeys) : [];

  // 5. Assemble per-member results
  const results: EnrichedDailyActivity[] = [];
  for (const member of team) {
    if (member.emails.length === 0) {
      results.push({ member, commits: [], branches: [], tickets: [], ticketSummaries: [] });
      continue;
    }

    const dayCommits: any[] = [];
    for (const email of member.emails) {
      const emailCommits = commitsByEmail.get(email);
      if (emailCommits) dayCommits.push(...emailCommits);
    }

    if (dayCommits.length === 0) {
      results.push({ member, commits: [], branches: [], tickets: [], ticketSummaries: [] });
      continue;
    }

    // Build branch details from pre-fetched data
    const memberBranchKeys = [...new Set(dayCommits.map((c) => `${c.repo}::${c.branch}`))];
    const branchDetails: EnrichedBranchDetail[] = [];
    for (const key of memberBranchKeys) {
      const [repo, branchName] = key.split("::");
      if (!repo || !branchName) continue;
      const branchRow = branchMap.get(key) ?? null;
      const ticket = branchRow?.jiraKey ? ticketMap.get(branchRow.jiraKey) ?? null : null;
      branchDetails.push({ name: branchName, repo, branch: branchRow, ticket });
    }

    // Collect tickets for this member
    const memberTicketKeySet = new Set<string>();
    for (const c of dayCommits) {
      if (c.jiraKeys) {
        for (const k of c.jiraKeys.split(",")) memberTicketKeySet.add(k.trim());
      }
    }
    for (const bd of branchDetails) {
      if (bd.branch?.jiraKey) memberTicketKeySet.add(bd.branch.jiraKey);
    }
    const ticketRows = [...memberTicketKeySet].map((k) => ticketMap.get(k)).filter((t): t is typeof tickets.$inferSelect => !!t);

    // Match summaries to this member's commits
    const dayShas = new Set(dayCommits.map((c) => c.sha));
    const matchedSummaries: (typeof ticketSummaries.$inferSelect)[] = [];
    for (const ts of allCandidateSummaries) {
      if (!ts.commitShas) continue;
      if (!memberTicketKeySet.has(ts.jiraKey)) continue;
      try {
        const shas: string[] = JSON.parse(ts.commitShas);
        if (shas.some((sha) => dayShas.has(sha))) {
          matchedSummaries.push(ts);
        }
      } catch {
        // commitShas not valid JSON, skip
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

/** Sprint-scoped daily commit counts — only counts commits on branches linked to sprint tickets */
export async function getSprintDailyCommitCounts(
  since: string,
  until: string,
  ticketKeys: string[],
): Promise<{ date: string; count: number }[]> {
  if (ticketKeys.length === 0) return [];
  const db = getDb();
  const untilPlusOne = new Date(new Date(until).getTime() + 86_400_000).toISOString().split("T")[0]!;

  // Get active branches linked to sprint tickets
  const sprintBranches: { repo: string; name: string }[] = [];
  for (let i = 0; i < ticketKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = ticketKeys.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select({ repo: branches.repo, name: branches.name })
      .from(branches)
      .where(and(eq(branches.isActive, 1), inArray(branches.jiraKey, chunk)));
    sprintBranches.push(...rows);
  }

  if (sprintBranches.length === 0) return [];

  // Deduplicate branch pairs (same branch name could appear if re-created)
  const seen = new Set<string>();
  const uniqueBranches = sprintBranches.filter((b) => {
    const key = `${b.repo}::${b.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Query in chunks to avoid oversized SQL with many OR conditions
  const allRows: { date: string; count: number }[] = [];
  for (let i = 0; i < uniqueBranches.length; i += SHA_CHUNK_SIZE) {
    const chunk = uniqueBranches.slice(i, i + SHA_CHUNK_SIZE);
    const branchConditions = chunk.map((b) =>
      sql`(${commits.repo} = ${b.repo} AND ${commits.branch} = ${b.name})`
    );

    const rows = await db.execute<{ date: string; count: number }>(
      sql`SELECT DATE(${commits.timestamp}) as date, COUNT(*)::integer as count
          FROM ${commits}
          WHERE ${commits.timestamp} >= ${since}
            AND ${commits.timestamp} < ${untilPlusOne}
            AND ${commits.repo} != 'test-repo'
            AND (${sql.join(branchConditions, sql` OR `)})
          GROUP BY DATE(${commits.timestamp})
          ORDER BY date ASC`
    );
    allRows.push(...(rows as unknown as { date: string; count: number }[]));
  }

  // Merge counts across chunks (same date can appear in multiple chunks)
  const merged = new Map<string, number>();
  for (const r of allRows) {
    merged.set(r.date, (merged.get(r.date) ?? 0) + r.count);
  }
  return [...merged.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
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

  // When jiraKeys filter is provided, use LIKE to narrow the query instead of full table scan
  const conditions = [TEST_REPO_FILTER, isNotNull(commits.jiraKeys)];
  if (jiraKeys && jiraKeys.length > 0) {
    // Build LIKE conditions in chunks to narrow results at SQL level
    const likeConditions = jiraKeys.map((key) => like(commits.jiraKeys, `%${key}%`));
    conditions.push(or(...likeConditions)!);
  }

  const rows = await db
    .select({
      jiraKeys: commits.jiraKeys,
      timestamp: commits.timestamp,
      authorEmail: commits.authorEmail,
      repo: commits.repo,
    })
    .from(commits)
    .where(and(...conditions));

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

  // Branch counts per jira key — filter to relevant keys when provided
  const branchConditions = [sql`${branches.repo} != 'test-repo'`, isNotNull(branches.jiraKey)];
  if (jiraKeys && jiraKeys.length > 0) {
    branchConditions.push(inArray(branches.jiraKey, jiraKeys));
  }
  const branchRows = await db
    .select({ jiraKey: branches.jiraKey })
    .from(branches)
    .where(and(...branchConditions));

  const branchCounts = new Map<string, number>();
  for (const br of branchRows) {
    if (!br.jiraKey) continue;
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

export async function getSprintTicketsGrouped(sprintId: number, opts?: QueryOpts): Promise<Record<string, any[]>> {
  const sprintTicketList = await getSprintTickets(sprintId, opts);
  const grouped: Record<string, any[]> = {};
  for (const t of sprintTicketList) {
    const status = t.status ?? "Unknown";
    if (!grouped[status]) grouped[status] = [];
    grouped[status]!.push(t);
  }
  return grouped;
}

// ── Pull Request Queries ──────────────────────────────────────────────────

export async function upsertPullRequests(
  repo: string,
  prs: PullRequestFullData[]
): Promise<{ id: number; prId: number }[]> {
  if (prs.length === 0) return [];
  const db = getDb();

  const results: { id: number; prId: number }[] = [];

  const values = prs.map((pr) => {
    const reviewerNames = pr.participants
      .filter((p) => p.role === "REVIEWER")
      .map((p) => p.displayName);
    return {
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
    };
  });

  for (let i = 0; i < values.length; i += SHA_CHUNK_SIZE) {
    const chunk = values.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db.insert(pullRequests).values(chunk).onConflictDoUpdate({
      target: [pullRequests.repo, pullRequests.prId],
      set: {
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        state: sql`excluded.state`,
        url: sql`excluded.url`,
        sourceBranch: sql`excluded.source_branch`,
        targetBranch: sql`excluded.target_branch`,
        authorName: sql`excluded.author_name`,
        reviewers: sql`excluded.reviewers`,
        approvals: sql`excluded.approvals`,
        commentCount: sql`excluded.comment_count`,
        taskCount: sql`excluded.task_count`,
        mergeCommitSha: sql`excluded.merge_commit_sha`,
        updatedAt: sql`excluded.updated_at`,
        // Don't update createdAt — preserve original creation timestamp
      },
    }).returning({ id: pullRequests.id, prId: pullRequests.prId });
    for (const r of rows) results.push({ id: r.id, prId: r.prId });
  }

  return results;
}

export async function storePRActivities(
  prRowId: number,
  repo: string,
  prId: number,
  activities: PRActivityEntry[]
): Promise<number> {
  if (activities.length === 0) return 0;
  const db = getDb();

  // Batch-fetch existing activities for this PR and build dedup Set
  const existingRows = await db
    .select({
      timestamp: prActivities.timestamp,
      activityType: prActivities.activityType,
      actorName: prActivities.actorName,
    })
    .from(prActivities)
    .where(eq(prActivities.pullRequestId, prRowId));

  const existingKeys = new Set<string>();
  for (const r of existingRows) {
    existingKeys.add(`${r.timestamp}|${r.activityType}|${r.actorName ?? ""}`);
  }

  // Filter to new activities and bulk insert
  const newActivities = activities.filter(
    (a) => !existingKeys.has(`${a.timestamp}|${a.activityType}|${a.actorName ?? ""}`)
  );

  if (newActivities.length > 0) {
    const values = newActivities.map((a) => ({
      pullRequestId: prRowId,
      repo,
      prId,
      activityType: a.activityType,
      actorName: a.actorName,
      timestamp: a.timestamp,
      newState: a.newState,
      commentText: a.commentText,
      commitHash: a.commitHash,
    }));
    for (let i = 0; i < values.length; i += SHA_CHUNK_SIZE) {
      const chunk = values.slice(i, i + SHA_CHUNK_SIZE);
      await db.insert(prActivities).values(chunk);
    }
  }

  return newActivities.length;
}

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

export async function computeAndCachePRMetrics(prRowId: number): Promise<void> {
  const db = getDb();
  const [ttfr, ttm, rounds] = await Promise.all([
    computeTimeToFirstReview(prRowId),
    computeTimeToMerge(prRowId),
    computeReviewRounds(prRowId),
  ]);

  await db.update(pullRequests)
    .set({
      timeToFirstReviewMins: ttfr,
      timeToMergeMins: ttm,
      reviewRounds: rounds,
      lastActivityFetched: new Date().toISOString(),
    })
    .where(eq(pullRequests.id, prRowId));
}

export async function computeAndCachePRMetricsBatch(prRowIds: number[]): Promise<void> {
  if (prRowIds.length === 0) return;
  const db = getDb();

  // 1. Batch-fetch all PR rows
  const allPRs: { id: number; createdAt: string; authorName: string | null; state: string; updatedAt: string }[] = [];
  for (let i = 0; i < prRowIds.length; i += SHA_CHUNK_SIZE) {
    const chunk = prRowIds.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select({
        id: pullRequests.id,
        createdAt: pullRequests.createdAt,
        authorName: pullRequests.authorName,
        state: pullRequests.state,
        updatedAt: pullRequests.updatedAt,
      })
      .from(pullRequests)
      .where(inArray(pullRequests.id, chunk));
    allPRs.push(...rows);
  }
  const prMap = new Map(allPRs.map((p) => [p.id, p]));

  // 2. Batch-fetch all activities for these PRs
  const allActivities: { pullRequestId: number; activityType: string; actorName: string | null; timestamp: string; newState: string | null }[] = [];
  for (let i = 0; i < prRowIds.length; i += SHA_CHUNK_SIZE) {
    const chunk = prRowIds.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select({
        pullRequestId: prActivities.pullRequestId,
        activityType: prActivities.activityType,
        actorName: prActivities.actorName,
        timestamp: prActivities.timestamp,
        newState: prActivities.newState,
      })
      .from(prActivities)
      .where(inArray(prActivities.pullRequestId, chunk))
      .orderBy(asc(prActivities.timestamp));
    allActivities.push(...rows);
  }

  // Group activities by pullRequestId
  const activitiesByPR = new Map<number, typeof allActivities>();
  for (const a of allActivities) {
    let arr = activitiesByPR.get(a.pullRequestId);
    if (!arr) { arr = []; activitiesByPR.set(a.pullRequestId, arr); }
    arr.push(a);
  }

  // 3. Compute metrics per PR and update
  const now = new Date().toISOString();
  for (const prRowId of prRowIds) {
    const pr = prMap.get(prRowId);
    if (!pr) continue;
    const activities = activitiesByPR.get(prRowId) ?? [];

    // TTFR: first non-author review activity
    let ttfr: number | null = null;
    const reviewTypes = new Set(["approval", "comment", "request_changes"]);
    for (const a of activities) {
      if (reviewTypes.has(a.activityType) && (!pr.authorName || a.actorName !== pr.authorName)) {
        const created = new Date(pr.createdAt).getTime();
        const reviewed = new Date(a.timestamp).getTime();
        ttfr = Math.round((reviewed - created) / 60_000);
        break;
      }
    }

    // TTM: time to merge (only for MERGED PRs)
    let ttm: number | null = null;
    if (pr.state === "MERGED") {
      const mergeActivity = activities.find((a) => a.activityType === "update" && a.newState === "MERGED");
      const created = new Date(pr.createdAt).getTime();
      const mergedAt = mergeActivity
        ? new Date(mergeActivity.timestamp).getTime()
        : new Date(pr.updatedAt).getTime();
      ttm = Math.round((mergedAt - created) / 60_000);
    }

    // Review rounds: count request_changes → update cycles
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

    await db.update(pullRequests)
      .set({
        timeToFirstReviewMins: ttfr,
        timeToMergeMins: ttm,
        reviewRounds: rounds,
        lastActivityFetched: now,
      })
      .where(eq(pullRequests.id, prRowId));
  }
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

export async function getPullRequestDetail(prRowId: number, opts?: QueryOpts) {
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
  let ticket: any = null;
  if (branch?.jiraKey) {
    const [ticketRow] = await (opts?.lite ? db.select(TICKET_LITE_COLS) : db.select()).from(tickets).where(eq(tickets.jiraKey, branch.jiraKey));
    ticket = ticketRow ?? null;
  }

  // Find commits on this branch
  const branchCommits = await (opts?.lite ? db.select(COMMIT_LITE_COLS) : db.select())
    .from(commits)
    .where(and(eq(commits.repo, pr.repo), eq(commits.branch, pr.sourceBranch)))
    .orderBy(desc(commits.timestamp));

  return { pr, activities, branch: branch ?? null, ticket, commits: branchCommits };
}

export async function getPRDashboardStats(repo?: string) {
  const db = getDb();
  const conditions = repo ? [eq(pullRequests.repo, repo)] : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Run all independent queries in parallel
  const [
    [totalOpenResult],
    [totalMergedResult],
    [totalDeclinedResult],
    mergedWithTTM,
    withTTFR,
    allPRs,
    allPRIdRows,
  ] = await Promise.all([
    db.select({ count: count() }).from(pullRequests)
      .where(where ? and(where, eq(pullRequests.state, "OPEN")) : eq(pullRequests.state, "OPEN")),
    db.select({ count: count() }).from(pullRequests)
      .where(where ? and(where, eq(pullRequests.state, "MERGED")) : eq(pullRequests.state, "MERGED")),
    db.select({ count: count() }).from(pullRequests)
      .where(where ? and(where, eq(pullRequests.state, "DECLINED")) : eq(pullRequests.state, "DECLINED")),
    db.select({ ttm: pullRequests.timeToMergeMins }).from(pullRequests)
      .where(where
        ? and(where, eq(pullRequests.state, "MERGED"), isNotNull(pullRequests.timeToMergeMins))
        : and(eq(pullRequests.state, "MERGED"), isNotNull(pullRequests.timeToMergeMins))),
    db.select({ ttfr: pullRequests.timeToFirstReviewMins }).from(pullRequests)
      .where(where
        ? and(where, isNotNull(pullRequests.timeToFirstReviewMins))
        : isNotNull(pullRequests.timeToFirstReviewMins)),
    db.select({ rounds: pullRequests.reviewRounds }).from(pullRequests).where(where),
    db.select({ id: pullRequests.id }).from(pullRequests).where(where),
  ]);

  const totalOpen = totalOpenResult?.count ?? 0;
  const totalMerged = totalMergedResult?.count ?? 0;
  const totalDeclined = totalDeclinedResult?.count ?? 0;

  const avgTimeToMergeHours = mergedWithTTM.length > 0
    ? Math.round(mergedWithTTM.reduce((s, r) => s + (r.ttm ?? 0), 0) / mergedWithTTM.length / 60 * 10) / 10
    : 0;

  const avgTimeToFirstReviewHours = withTTFR.length > 0
    ? Math.round(withTTFR.reduce((s, r) => s + (r.ttfr ?? 0), 0) / withTTFR.length / 60 * 10) / 10
    : 0;

  const avgReviewRounds = allPRs.length > 0
    ? Math.round(allPRs.reduce((s, r) => s + (r.rounds ?? 0), 0) / allPRs.length * 10) / 10
    : 0;

  // PRs without any review activity
  const allPRIds = allPRIdRows.map((r) => r.id);
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

/**
 * Get PR stats scoped to a specific sprint by looking up PRs linked to sprint branches.
 */
export async function getSprintPRStats(sprintId: number) {
  const db = getDb();

  // Get sprint branch PR IDs
  const ticketKeys = await getSprintTicketKeys(sprintId);
  if (ticketKeys.length === 0) {
    return { totalMerged: 0, avgTimeToMergeHours: 0, avgReviewRounds: 0 };
  }

  // Collect (repo, prId) pairs from branches linked to sprint tickets
  const prPairs: { repo: string; prId: number }[] = [];
  for (let i = 0; i < ticketKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = ticketKeys.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select({ repo: branches.repo, prId: branches.prId })
      .from(branches)
      .where(and(inArray(branches.jiraKey, chunk), isNotNull(branches.prId)));
    for (const r of rows) {
      if (r.prId != null) prPairs.push({ repo: r.repo, prId: r.prId });
    }
  }

  if (prPairs.length === 0) {
    return { totalMerged: 0, avgTimeToMergeHours: 0, avgReviewRounds: 0 };
  }

  // Query pullRequests matching both repo and prId to avoid cross-repo collisions
  type PRStatRow = { state: string; timeToMergeMins: number | null; reviewRounds: number | null };
  const sprintPRs: PRStatRow[] = [];
  for (let i = 0; i < prPairs.length; i += SHA_CHUNK_SIZE) {
    const chunk = prPairs.slice(i, i + SHA_CHUNK_SIZE);
    const orConditions = chunk.map((p) =>
      and(eq(pullRequests.repo, p.repo), eq(pullRequests.prId, p.prId))
    );
    const rows = await db
      .select({
        state: pullRequests.state,
        timeToMergeMins: pullRequests.timeToMergeMins,
        reviewRounds: pullRequests.reviewRounds,
      })
      .from(pullRequests)
      .where(or(...orConditions));
    sprintPRs.push(...rows);
  }

  const merged = sprintPRs.filter((pr) => pr.state === "MERGED");
  const totalMerged = merged.length;

  const mergedWithTTM = merged.filter((pr) => pr.timeToMergeMins != null);
  const avgTimeToMergeHours = mergedWithTTM.length > 0
    ? Math.round(mergedWithTTM.reduce((s, r) => s + (r.timeToMergeMins ?? 0), 0) / mergedWithTTM.length / 60 * 10) / 10
    : 0;

  const avgReviewRounds = sprintPRs.length > 0
    ? Math.round(sprintPRs.reduce((s, r) => s + (r.reviewRounds ?? 0), 0) / sprintPRs.length * 10) / 10
    : 0;

  return { totalMerged, avgTimeToMergeHours, avgReviewRounds };
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
  const firstReviewPerPR = new Map<string, number>(); 

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

/**
 * Batch upsert status changes for multiple tickets at once.
 * Flattens all changes, fetches existing dedup keys in one query, then bulk inserts.
 */
async function upsertTicketStatusChangesBatch(ticketData: TicketData[]): Promise<void> {
  // Flatten all status changes across all tickets
  const allValues: { jiraKey: string; changedAt: string; fromStatus: string | null; toStatus: string; changedBy: string | null }[] = [];
  for (const t of ticketData) {
    if (t.statusChanges && t.statusChanges.length > 0) {
      for (const c of t.statusChanges) {
        allValues.push({
          jiraKey: t.jiraKey,
          changedAt: c.changedAt,
          fromStatus: c.fromStatus,
          toStatus: c.toStatus,
          changedBy: c.changedBy,
        });
      }
    }
  }
  if (allValues.length === 0) return;

  const db = getDb();

  // Batch-fetch all existing status changes for the relevant jira keys
  const jiraKeys = [...new Set(allValues.map((v) => v.jiraKey))];
  const existingKeys = new Set<string>();
  for (let i = 0; i < jiraKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = jiraKeys.slice(i, i + SHA_CHUNK_SIZE);
    const rows = await db
      .select({ jiraKey: ticketStatusChanges.jiraKey, changedAt: ticketStatusChanges.changedAt, toStatus: ticketStatusChanges.toStatus })
      .from(ticketStatusChanges)
      .where(inArray(ticketStatusChanges.jiraKey, chunk));
    for (const r of rows) {
      existingKeys.add(`${r.jiraKey}|${r.changedAt}|${r.toStatus}`);
    }
  }

  // Filter to new changes and bulk insert
  const newValues = allValues.filter(
    (v) => !existingKeys.has(`${v.jiraKey}|${v.changedAt}|${v.toStatus}`)
  );

  if (newValues.length > 0) {
    for (let i = 0; i < newValues.length; i += SHA_CHUNK_SIZE) {
      const chunk = newValues.slice(i, i + SHA_CHUNK_SIZE);
      await db.insert(ticketStatusChanges).values(chunk);
    }
  }
}

export async function upsertTicketStatusChanges(jiraKey: string, changes: StatusChange[]): Promise<void> {
  if (changes.length === 0) return;
  const db = getDb();

  // Batch-fetch existing changes for this jiraKey and build dedup Set
  const existingRows = await db
    .select({ changedAt: ticketStatusChanges.changedAt, toStatus: ticketStatusChanges.toStatus })
    .from(ticketStatusChanges)
    .where(eq(ticketStatusChanges.jiraKey, jiraKey));

  const existingKeys = new Set<string>();
  for (const r of existingRows) {
    existingKeys.add(`${r.changedAt}|${r.toStatus}`);
  }

  // Filter to new changes and bulk insert
  const newChanges = changes.filter(
    (c) => !existingKeys.has(`${c.changedAt}|${c.toStatus}`)
  );

  if (newChanges.length > 0) {
    const values = newChanges.map((c) => ({
      jiraKey,
      changedAt: c.changedAt,
      fromStatus: c.fromStatus,
      toStatus: c.toStatus,
      changedBy: c.changedBy,
    }));
    for (let i = 0; i < values.length; i += SHA_CHUNK_SIZE) {
      const chunk = values.slice(i, i + SHA_CHUNK_SIZE);
      await db.insert(ticketStatusChanges).values(chunk);
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

  // Batch fetch all status changes for sprint tickets
  const statusChangesMap = new Map<string, (typeof ticketStatusChanges.$inferSelect)[]>();
  for (let i = 0; i < ticketKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = ticketKeys.slice(i, i + SHA_CHUNK_SIZE);
    const changes = await db
      .select()
      .from(ticketStatusChanges)
      .where(inArray(ticketStatusChanges.jiraKey, chunk))
      .orderBy(asc(ticketStatusChanges.changedAt));
    for (const c of changes) {
      let arr = statusChangesMap.get(c.jiraKey);
      if (!arr) { arr = []; statusChangesMap.set(c.jiraKey, arr); }
      arr.push(c);
    }
  }

  // Generate each day in the sprint range
  const startMs = new Date(sprint.startDate).getTime();
  const endMs = new Date(sprint.endDate).getTime();
  const days: SprintBurndownDay[] = [];

  // Batch fetch all daily commit counts for the entire sprint range in one query
  const sprintStartDate = new Date(startMs).toISOString().split("T")[0]!;
  const sprintEndDate = new Date(endMs).toISOString().split("T")[0]!;
  const allDailyCounts = await getSprintDailyCommitCounts(sprintStartDate, sprintEndDate, ticketKeys);
  const dailyCountMap = new Map<string, number>();
  for (const dc of allDailyCounts) {
    dailyCountMap.set(dc.date, dc.count);
  }

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

    const commitsToday = dailyCountMap.get(date) ?? 0;

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

  // Get commits in sprint date range with SQL LIKE pre-filter + isNotNull
  const conditions = [TEST_REPO_FILTER, isNotNull(commits.jiraKeys)];
  if (sprint.startDate) conditions.push(gte(commits.timestamp, sprint.startDate));
  if (sprint.endDate) {
    const endPlusOne = new Date(new Date(sprint.endDate).getTime() + 86_400_000).toISOString();
    conditions.push(lte(commits.timestamp, endPlusOne));
  }

  // SQL LIKE pre-filter to narrow results at DB level
  if (ticketKeys.length > 0) {
    const likeConditions = ticketKeys.map((key) => like(commits.jiraKeys, `%${key}%`));
    conditions.push(or(...likeConditions)!);
  }

  const preFilteredCommits = await db
    .select()
    .from(commits)
    .where(and(...conditions));

  // Post-filter for exact key match
  const sprintCommits = preFilteredCommits.filter((c) => {
    if (!c.jiraKeys) return false;
    return c.jiraKeys.split(",").some((k) => keySet.has(k.trim()));
  });

  // Build email-to-member map for matching
  const emailToMember = new Map<string, string>();
  for (const m of team) {
    for (const e of m.emails) emailToMember.set(e.toLowerCase(), m.name);
  }

  // Get sprint branches with PR data — match PRs to members via branch authorEmail
  const prCountsByMember = new Map<string, number>();
  for (let i = 0; i < ticketKeys.length; i += SHA_CHUNK_SIZE) {
    const chunk = ticketKeys.slice(i, i + SHA_CHUNK_SIZE);
    const branchRows = await db
      .select({ authorEmail: branches.authorEmail, prId: branches.prId, prState: branches.prState })
      .from(branches)
      .where(and(inArray(branches.jiraKey, chunk), isNotNull(branches.prId)));
    for (const b of branchRows) {
      if (b.prState === "MERGED") {
        const memberName = emailToMember.get(b.authorEmail.toLowerCase());
        if (memberName) {
          prCountsByMember.set(memberName, (prCountsByMember.get(memberName) ?? 0) + 1);
        }
      }
    }
  }

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

    results.push({
      name: member.name,
      commitCount: memberCommits.length,
      ticketCount: memberTickets.size,
      prsMerged: prCountsByMember.get(member.name) ?? 0,
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
  date: string,
  opts?: QueryOpts
): Promise<StandupMemberData[]> {
  const db = getDb();
  const now = Date.now();

  // Yesterday = date - 1 day
  const dateMs = new Date(date + "T00:00:00Z").getTime();
  const yesterdayDate = new Date(dateMs - 86_400_000).toISOString().split("T")[0]!;
  const nextDay = new Date(new Date(yesterdayDate).getTime() + 86_400_000).toISOString().split("T")[0]!;

  const allEmails = team.flatMap((m) => m.emails).filter((e) => e);
  if (allEmails.length === 0) {
    return team.map((member) => ({
      member,
      yesterday: { commits: [], ticketsMoved: [], prsMerged: [], summaries: [] },
      today: { activeBranches: [], activeTickets: [], openPRs: [] },
      blockers: { stalePRs: [], idleTickets: [] },
    }));
  }

  // ── Batch 1: Fetch all yesterday commits, status changes, branches, author names in parallel ──
  const [allYesterdayCommits, allYesterdayChanges, allMemberBranches, authorNameRows] = await Promise.all([
    (opts?.lite ? db.select(COMMIT_LITE_COLS) : db.select()).from(commits).where(and(
      inArray(commits.authorEmail, allEmails),
      gte(commits.timestamp, yesterdayDate),
      lte(commits.timestamp, nextDay + "T00:00:00.000Z"),
      TEST_REPO_FILTER,
    )).orderBy(desc(commits.timestamp)),

    db.select().from(ticketStatusChanges).where(and(
      gte(ticketStatusChanges.changedAt, yesterdayDate),
      lte(ticketStatusChanges.changedAt, nextDay + "T00:00:00.000Z"),
    )),

    db.select().from(branches).where(and(
      inArray(branches.authorEmail, allEmails),
      eq(branches.isActive, 1),
      sql`${branches.repo} != 'test-repo'`,
    )),

    db.select({ authorEmail: commits.authorEmail, authorName: commits.authorName })
      .from(commits)
      .where(inArray(commits.authorEmail, allEmails))
      .groupBy(commits.authorEmail, commits.authorName),
  ]);

  // Index by email
  const commitsByEmail = new Map<string, any[]>();
  for (const c of allYesterdayCommits) {
    let arr = commitsByEmail.get(c.authorEmail);
    if (!arr) { arr = []; commitsByEmail.set(c.authorEmail, arr); }
    arr.push(c);
  }

  const branchesByEmail = new Map<string, (typeof branches.$inferSelect)[]>();
  for (const b of allMemberBranches) {
    let arr = branchesByEmail.get(b.authorEmail);
    if (!arr) { arr = []; branchesByEmail.set(b.authorEmail, arr); }
    arr.push(b);
  }

  const authorNamesByEmail = new Map<string, Set<string>>();
  for (const r of authorNameRows) {
    let set = authorNamesByEmail.get(r.authorEmail);
    if (!set) { set = new Set(); authorNamesByEmail.set(r.authorEmail, set); }
    set.add(r.authorName);
  }

  // ── Batch 2: Collect all ticket keys across all members, fetch tickets + summaries ──
  const allTicketKeySet = new Set<string>();
  const allAuthorNames = new Set<string>();
  for (const member of team) {
    for (const email of member.emails) {
      const memberCommits = commitsByEmail.get(email) ?? [];
      for (const c of memberCommits) {
        if (c.jiraKeys) for (const k of c.jiraKeys.split(",")) allTicketKeySet.add(k.trim());
      }
      const memberBranchesList = branchesByEmail.get(email) ?? [];
      for (const b of memberBranchesList) {
        if (b.jiraKey) allTicketKeySet.add(b.jiraKey);
      }
      const names = authorNamesByEmail.get(email);
      if (names) for (const n of names) allAuthorNames.add(n);
    }
  }

  const allTicketKeys = [...allTicketKeySet];
  const allAuthorNameArr = [...allAuthorNames];

  // Batch fetch tickets, summaries, merged PRs, and open PRs in parallel
  const [allTicketRows, allSummaries, allMergedPRs, allOpenPRs] = await Promise.all([
    allTicketKeys.length > 0 ? getTicketsByKeys(allTicketKeys, opts) : Promise.resolve([]),
    allTicketKeys.length > 0 ? getTicketSummariesByKeys(allTicketKeys) : Promise.resolve([]),
    allAuthorNameArr.length > 0 ? db.select({ prId: pullRequests.prId, title: pullRequests.title, repo: pullRequests.repo, authorName: pullRequests.authorName })
      .from(pullRequests)
      .where(and(
        eq(pullRequests.state, "MERGED"),
        inArray(pullRequests.authorName, allAuthorNameArr),
        gte(pullRequests.updatedAt, yesterdayDate),
        lte(pullRequests.updatedAt, nextDay + "T00:00:00.000Z"),
      )) : Promise.resolve([]),
    allAuthorNameArr.length > 0 ? db.select({ prId: pullRequests.prId, title: pullRequests.title, repo: pullRequests.repo, createdAt: pullRequests.createdAt, authorName: pullRequests.authorName })
      .from(pullRequests)
      .where(and(
        eq(pullRequests.state, "OPEN"),
        inArray(pullRequests.authorName, allAuthorNameArr),
      )) : Promise.resolve([]),
  ]);

  // Build lookup maps
  const ticketMap = new Map<string, any>();
  for (const t of allTicketRows) ticketMap.set(t.jiraKey, t);

  const summaryMap = new Map<string, { jiraKey: string; summaryText: string }[]>();
  for (const ts of allSummaries) {
    let arr = summaryMap.get(ts.jiraKey);
    if (!arr) { arr = []; summaryMap.set(ts.jiraKey, arr); }
    arr.push({ jiraKey: ts.jiraKey, summaryText: ts.summaryText });
  }

  // ── Batch 3: Fetch last commit dates for idle ticket detection ──
  // Collect all active ticket keys across all members
  const inProgressStatuses = ["In Progress", "In Development", "Development", "In Review", "Code Review", "Review"];
  const allActiveTicketKeys: string[] = [];
  for (const key of allTicketKeys) {
    const t = ticketMap.get(key);
    if (t?.status && inProgressStatuses.includes(t.status)) {
      allActiveTicketKeys.push(key);
    }
  }

  // Batch fetch last commit for each active ticket
  const lastCommitByTicket = new Map<string, string>();
  if (allActiveTicketKeys.length > 0) {
    for (let i = 0; i < allActiveTicketKeys.length; i += SHA_CHUNK_SIZE) {
      const chunk = allActiveTicketKeys.slice(i, i + SHA_CHUNK_SIZE);
      const likeConditions = chunk.map((key) => like(commits.jiraKeys, `%${key}%`));
      const rows = await db
        .select({ jiraKeys: commits.jiraKeys, timestamp: commits.timestamp })
        .from(commits)
        .where(and(TEST_REPO_FILTER, or(...likeConditions)))
        .orderBy(desc(commits.timestamp));

      const keySet = new Set(chunk);
      for (const row of rows) {
        if (!row.jiraKeys) continue;
        for (const k of row.jiraKeys.split(",")) {
          const trimmed = k.trim();
          if (keySet.has(trimmed) && !lastCommitByTicket.has(trimmed)) {
            lastCommitByTicket.set(trimmed, row.timestamp);
          }
        }
      }
    }
  }

  // ── Assemble per-member results ──
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

    // Gather member data from pre-fetched maps
    const yesterdayCommits: any[] = [];
    const memberBranchesList: (typeof branches.$inferSelect)[] = [];
    const memberAuthorNames = new Set<string>();
    for (const email of member.emails) {
      const ec = commitsByEmail.get(email);
      if (ec) yesterdayCommits.push(...ec);
      const eb = branchesByEmail.get(email);
      if (eb) memberBranchesList.push(...eb);
      const names = authorNamesByEmail.get(email);
      if (names) for (const n of names) memberAuthorNames.add(n);
    }

    // Member ticket keys
    const memberTicketKeys = new Set<string>();
    for (const c of yesterdayCommits) {
      if (c.jiraKeys) for (const k of c.jiraKeys.split(",")) memberTicketKeys.add(k.trim());
    }
    for (const b of memberBranchesList) {
      if (b.jiraKey) memberTicketKeys.add(b.jiraKey);
    }

    // Tickets moved yesterday — filter pre-fetched changes
    const ticketsMoved: StandupMemberData["yesterday"]["ticketsMoved"] = [];
    for (const change of allYesterdayChanges) {
      if (memberTicketKeys.has(change.jiraKey)) {
        const ticket = ticketMap.get(change.jiraKey);
        ticketsMoved.push({
          jiraKey: change.jiraKey,
          summary: ticket?.summary ?? null,
          fromStatus: change.fromStatus ?? "?",
          toStatus: change.toStatus,
        });
      }
    }

    // PRs merged yesterday — filter pre-fetched
    const prsMerged = allMergedPRs
      .filter((pr) => memberAuthorNames.has(pr.authorName))
      .map((pr) => ({ prId: pr.prId, title: pr.title, repo: pr.repo }));

    // Summaries — filter pre-fetched
    const summaries: StandupMemberData["yesterday"]["summaries"] = [];
    for (const key of memberTicketKeys) {
      const s = summaryMap.get(key);
      if (s) summaries.push(...s);
    }

    // Active tickets
    const activeTickets: StandupMemberData["today"]["activeTickets"] = [];
    const activeTicketKeySet = new Set<string>();
    for (const key of memberTicketKeys) {
      const t = ticketMap.get(key);
      if (t?.status && inProgressStatuses.includes(t.status)) {
        activeTickets.push({ jiraKey: t.jiraKey, summary: t.summary, status: t.status });
        activeTicketKeySet.add(t.jiraKey);
      }
    }

    // Active branches
    const activeBranches = memberBranchesList
      .filter((b) => b.prState === "OPEN" || (b.jiraKey && activeTicketKeySet.has(b.jiraKey)))
      .map((b) => ({ name: b.name, repo: b.repo, jiraKey: b.jiraKey, prState: b.prState }));

    // Open PRs — filter pre-fetched
    const openPRs = allOpenPRs
      .filter((pr) => memberAuthorNames.has(pr.authorName))
      .map((pr) => ({ prId: pr.prId, title: pr.title, repo: pr.repo, createdAt: pr.createdAt }));

    // Stale PRs
    const stalePRs: StandupMemberData["blockers"]["stalePRs"] = [];
    for (const pr of openPRs) {
      const ageHours = Math.round((now - new Date(pr.createdAt).getTime()) / 3_600_000);
      if (ageHours > 48) {
        stalePRs.push({ prId: pr.prId, title: pr.title, repo: pr.repo, ageHours });
      }
    }

    // Idle tickets — use pre-fetched last commit data
    const idleTickets: StandupMemberData["blockers"]["idleTickets"] = [];
    const threeDaysAgo = new Date(now - 3 * 86_400_000).toISOString();
    for (const at of activeTickets) {
      const lastTs = lastCommitByTicket.get(at.jiraKey);
      if (lastTs && lastTs < threeDaysAgo) {
        const idleDays = Math.round((now - new Date(lastTs).getTime()) / 86_400_000);
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
