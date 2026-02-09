/**
 * Fetch MERGED pull requests from Bitbucket with date-range filtering.
 * Full pagination, skips PRs with zero comments.
 */

import { bitbucketFetch, type BitbucketClientConfig } from "./client";

export interface MergedPRInfo {
  prId: number;
  title: string;
  authorName: string;
  sourceBranch: string;
  url: string;
  commentCount: number;
  updatedOn: string;
}

export interface FetchMergedPRsOptions {
  limit?: number;
  verbose?: boolean;
}

/**
 * Fetch all MERGED PRs from a Bitbucket repo updated since `since`.
 * Paginates fully, skips PRs with commentCount === 0.
 */
export async function fetchMergedPRs(
  config: BitbucketClientConfig,
  repoSlug: string,
  since: string,
  opts?: FetchMergedPRsOptions
): Promise<MergedPRInfo[]> {
  const limit = opts?.limit ?? Infinity;
  const verbose = opts?.verbose ?? false;

  const q = encodeURIComponent(`updated_on > ${since}T00:00:00+00:00`);
  let nextUrl: string | null =
    `/repositories/${config.workspace}/${repoSlug}/pullrequests?state=MERGED&sort=-updated_on&pagelen=50&q=${q}`;

  const prs: MergedPRInfo[] = [];
  let pages = 0;

  while (nextUrl && prs.length < limit) {
    const result = await bitbucketFetch(config, nextUrl);

    if (!result.ok) {
      if (result.status === 401) {
        console.error("Bitbucket 401: check credentials (BITBUCKET_EMAIL + BITBUCKET_API_TOKEN)");
        return prs;
      }
      if (pages === 0) {
        console.error(`Merged PRs: error ${result.status} — ${result.message}`);
      }
      break;
    }

    const data = result.data;
    const values = (data.values ?? []) as any[];

    for (const pr of values) {
      if (prs.length >= limit) break;

      const commentCount = pr.comment_count ?? 0;
      if (commentCount === 0) continue;

      prs.push({
        prId: pr.id,
        title: pr.title ?? "",
        authorName: pr.author?.display_name ?? "Unknown",
        sourceBranch: pr.source?.branch?.name ?? "",
        url: pr.links?.html?.href ?? "",
        commentCount,
        updatedOn: pr.updated_on ?? "",
      });
    }

    if (verbose) {
      console.log(`  Page ${pages + 1}: ${values.length} PRs fetched, ${prs.length} with comments so far`);
    }

    nextUrl = data.next ?? null;
    pages++;

    // Rate limiting delay between pages
    if (nextUrl) await sleep(200);
  }

  return prs;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
