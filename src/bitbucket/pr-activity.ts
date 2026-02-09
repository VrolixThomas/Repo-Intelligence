/**
 * Bitbucket PR activity timeline fetching.
 * Fetches the /activity endpoint for a PR and normalizes events.
 */

import { bitbucketFetch, type BitbucketClientConfig } from "./client";

export interface PRActivityEntry {
  activityType: "approval" | "comment" | "update" | "request_changes";
  actorName: string | null;
  timestamp: string;
  newState: string | null;
  commentText: string | null;
  commitHash: string | null;
}

/**
 * Fetch activity timeline for a single PR.
 * Paginates up to 3 pages (150 events max).
 */
export async function fetchPRActivity(
  config: BitbucketClientConfig,
  repoSlug: string,
  prId: number
): Promise<PRActivityEntry[]> {
  const activities: PRActivityEntry[] = [];
  let nextUrl: string | null = `/repositories/${config.workspace}/${repoSlug}/pullrequests/${prId}/activity?pagelen=50`;
  let pages = 0;

  while (nextUrl && pages < 3) {
    const result = await bitbucketFetch(config, nextUrl);
    if (!result.ok) {
      if (pages === 0) {
        console.log(`  PR Activity: error ${result.status} for PR #${prId}`);
      }
      break;
    }

    const data = result.data;
    const values = (data.values ?? []) as any[];

    for (const entry of values) {
      const parsed = parseActivityEntry(entry);
      if (parsed) activities.push(parsed);
    }

    nextUrl = data.next ?? null;
    pages++;
  }

  return activities;
}

function parseActivityEntry(entry: any): PRActivityEntry | null {
  if (entry.approval) {
    return {
      activityType: "approval",
      actorName: entry.approval.user?.display_name ?? null,
      timestamp: entry.approval.date ?? "",
      newState: null,
      commentText: null,
      commitHash: null,
    };
  }

  if (entry.comment) {
    const rawText = entry.comment.content?.raw ?? "";
    return {
      activityType: "comment",
      actorName: entry.comment.user?.display_name ?? null,
      timestamp: entry.comment.created_on ?? "",
      newState: null,
      commentText: rawText.slice(0, 500),
      commitHash: null,
    };
  }

  if (entry.update) {
    // Check if this is a "changes requested" event
    const isChangesRequested = entry.update.changes?.status?.new === "changes_requested"
      || entry.update.state === "changes_requested";

    if (isChangesRequested) {
      return {
        activityType: "request_changes",
        actorName: entry.update.author?.display_name ?? null,
        timestamp: entry.update.date ?? "",
        newState: "changes_requested",
        commentText: null,
        commitHash: null,
      };
    }

    // Regular update (new commits pushed)
    return {
      activityType: "update",
      actorName: entry.update.author?.display_name ?? null,
      timestamp: entry.update.date ?? "",
      newState: entry.update.state ?? null,
      commentText: null,
      commitHash: entry.update.source?.commit?.hash ?? null,
    };
  }

  return null;
}
