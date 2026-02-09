/**
 * Fetch ALL comments (inline + general) for Bitbucket PRs.
 * Full text, no truncation. Filters out PR author's own comments.
 */

import { bitbucketFetch, type BitbucketClientConfig } from "./client";
import type { MergedPRInfo } from "./merged-prs";

export interface PRComment {
  commentId: number;
  authorName: string;
  content: string;          // Full content.raw — NO truncation
  createdAt: string;
  isInline: boolean;
  filePath: string | null;  // inline.path if inline comment
  lineTo: number | null;    // inline.to (line being commented on)
  parentId: number | null;  // For threaded replies
}

export interface PRCommentBundle {
  prId: number;
  prTitle: string;
  prAuthor: string;
  prUrl: string;
  comments: PRComment[];    // Only reviewer comments (author's own filtered out)
}

export interface FetchCommentsOptions {
  verbose?: boolean;
}

/**
 * Fetch all comments for a single PR. Full pagination, no page limit.
 */
export async function fetchPRComments(
  config: BitbucketClientConfig,
  repoSlug: string,
  prId: number
): Promise<PRComment[]> {
  const comments: PRComment[] = [];
  let nextUrl: string | null =
    `/repositories/${config.workspace}/${repoSlug}/pullrequests/${prId}/comments?pagelen=100`;

  while (nextUrl) {
    const result = await bitbucketFetch(config, nextUrl);

    if (!result.ok) {
      if (result.status === 404) {
        console.warn(`  Comments: PR #${prId} not found (404), skipping`);
        return comments;
      }
      if (result.status === 429) {
        console.warn(`  Comments: rate limited on PR #${prId}, waiting 5s...`);
        await sleep(5000);
        // Retry once
        const retry = await bitbucketFetch(config, nextUrl);
        if (!retry.ok) break;
        const retryData = retry.data;
        const retryValues = (retryData.values ?? []) as any[];
        for (const c of retryValues) {
          const parsed = parseComment(c);
          if (parsed) comments.push(parsed);
        }
        nextUrl = retryData.next ?? null;
        continue;
      }
      break;
    }

    const data = result.data;
    const values = (data.values ?? []) as any[];

    for (const c of values) {
      const parsed = parseComment(c);
      if (parsed) comments.push(parsed);
    }

    nextUrl = data.next ?? null;

    // Rate limiting delay between pages
    if (nextUrl) await sleep(100);
  }

  return comments;
}

/**
 * Fetch comments for all PRs, filtering out each PR author's own comments.
 * Returns bundles with only reviewer feedback.
 */
export async function fetchAllPRComments(
  config: BitbucketClientConfig,
  repoSlug: string,
  prs: MergedPRInfo[],
  opts?: FetchCommentsOptions
): Promise<PRCommentBundle[]> {
  const verbose = opts?.verbose ?? false;
  const bundles: PRCommentBundle[] = [];

  const startTime = Date.now();
  let totalCommentsSoFar = 0;

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i]!;

    // Always show progress every 10 PRs, or every PR in verbose mode
    if (verbose) {
      console.log(`  [${i + 1}/${prs.length}] PR #${pr.prId}: ${pr.title}`);
    } else if (i % 10 === 0 || i === prs.length - 1) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = i > 0 ? elapsed / i : 1;
      const remaining = Math.round(rate * (prs.length - i));
      process.stdout.write(`\r  Progress: ${i + 1}/${prs.length} PRs | ${totalCommentsSoFar} comments | ~${remaining}s remaining   `);
    }

    const allComments = await fetchPRComments(config, repoSlug, pr.prId);

    // Filter out PR author's own comments — keep only reviewer feedback
    const reviewerComments = allComments.filter(
      c => c.authorName.toLowerCase() !== pr.authorName.toLowerCase()
    );
    totalCommentsSoFar += reviewerComments.length;

    if (reviewerComments.length > 0) {
      bundles.push({
        prId: pr.prId,
        prTitle: pr.title,
        prAuthor: pr.authorName,
        prUrl: pr.url,
        comments: reviewerComments,
      });
    }

    // Rate limiting delay between PRs
    if (i < prs.length - 1) await sleep(500);
  }

  // Clear the progress line
  if (!verbose && prs.length > 0) {
    process.stdout.write("\r" + " ".repeat(80) + "\r");
  }

  return bundles;
}

function parseComment(c: any): PRComment | null {
  const content = c.content?.raw ?? "";
  if (!content.trim()) return null;

  const inline = c.inline ?? null;

  return {
    commentId: c.id ?? 0,
    authorName: c.user?.display_name ?? "Unknown",
    content,
    createdAt: c.created_on ?? "",
    isInline: inline !== null,
    filePath: inline?.path ?? null,
    lineTo: inline?.to ?? null,
    parentId: c.parent?.id ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
