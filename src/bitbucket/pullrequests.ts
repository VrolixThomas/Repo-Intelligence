/**
 * Bitbucket pull request fetching.
 * Fetches ALL recent PRs for a repo in bulk, then matches by source branch name.
 */

import { bitbucketFetch, type BitbucketClientConfig } from "./client";

export interface PullRequestData {
  prId: number;
  prTitle: string;
  prState: "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED";
  prUrl: string;
  prTargetBranch: string;
  prReviewers: string[];
  prApprovals: number;
  prCreatedAt: string;
  prUpdatedAt: string;
  sourceBranch: string;
}

export interface PullRequestFullData extends PullRequestData {
  description: string | null;
  commentCount: number;
  taskCount: number;
  authorName: string | null;
  mergeCommitSha: string | null;
  participants: { displayName: string; role: string; approved: boolean; state: string | null }[];
}

/**
 * Fetch all recent PRs for a repo and return a map keyed by source branch name.
 * Uses 1-2 paginated bulk calls (50 per page).
 * Also returns a flat array of all PRs with full data for the PR tracking table.
 */
export async function fetchRepoPullRequests(
  config: BitbucketClientConfig,
  repoSlug: string
): Promise<{ prMap: Map<string, PullRequestData>; allPRs: PullRequestFullData[] }> {
  const prMap = new Map<string, PullRequestData>();
  const allPRs: PullRequestFullData[] = [];
  let nextUrl: string | null = `/repositories/${config.workspace}/${repoSlug}/pullrequests?state=OPEN&state=MERGED&state=DECLINED&sort=-updated_on&pagelen=50`;

  // Fetch up to 2 pages (100 PRs)
  let pages = 0;
  while (nextUrl && pages < 2) {
    const result = await bitbucketFetch(config, nextUrl);

    if (!result.ok) {
      if (result.status === 401) {
        console.log("  Bitbucket: authentication failed — check credentials");
      } else {
        console.log(`  Bitbucket: API error ${result.status} fetching PRs`);
      }
      return { prMap, allPRs };
    }

    const data = result.data;
    const values = data.values as any[];

    for (const pr of values) {
      const sourceBranch = pr.source?.branch?.name;
      if (!sourceBranch) continue;

      // Count approvals from participants
      const participants = (pr.participants ?? []) as any[];
      const approvals = participants.filter((p: any) => p.approved === true).length;
      const reviewers = participants
        .filter((p: any) => p.role === "REVIEWER")
        .map((p: any) => p.user?.display_name ?? p.user?.nickname ?? "Unknown");

      const fullParticipants = participants.map((p: any) => ({
        displayName: p.user?.display_name ?? p.user?.nickname ?? "Unknown",
        role: p.role ?? "PARTICIPANT",
        approved: p.approved === true,
        state: p.state ?? null,
      }));

      const prData: PullRequestFullData = {
        prId: pr.id,
        prTitle: pr.title ?? "",
        prState: pr.state ?? "OPEN",
        prUrl: pr.links?.html?.href ?? "",
        prTargetBranch: pr.destination?.branch?.name ?? "",
        prReviewers: reviewers,
        prApprovals: approvals,
        prCreatedAt: pr.created_on ?? "",
        prUpdatedAt: pr.updated_on ?? "",
        sourceBranch,
        description: pr.description ?? null,
        commentCount: pr.comment_count ?? 0,
        taskCount: pr.task_count ?? 0,
        authorName: pr.author?.display_name ?? null,
        mergeCommitSha: pr.merge_commit?.hash ?? null,
        participants: fullParticipants,
      };

      allPRs.push(prData);

      // Keep the most recently updated PR per branch (for backward compat branch table)
      const existing = prMap.get(sourceBranch);
      if (!existing || prData.prUpdatedAt > existing.prUpdatedAt) {
        prMap.set(sourceBranch, prData);
      }
    }

    nextUrl = data.next ?? null;
    pages++;
  }

  return { prMap, allPRs };
}
