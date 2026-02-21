/**
 * Group commits by Jira ticket key + repo.
 *
 * Resolution order:
 * 1. Branch jiraKey from DB (passed in as branchJiraKeys map)
 * 2. Commit message jiraKeys (extracted by scanner)
 * 3. Orphan commits grouped under `branch:{branchName}`
 */

import type { CommitInfo, RepoScanResult } from "./scanner";

export interface TicketWorkBundle {
  commits: CommitInfo[];
  branchNames: Set<string>;
  authorEmails: Set<string>;
}

/**
 * Group commits from scan results into ticket work bundles.
 *
 * @param results - Scan results from scanAllRepos
 * @param branchJiraKeys - Map of "repo::branch" → jiraKey (from DB lookup)
 * @returns Map of jiraKey → Map of repoName → TicketWorkBundle
 */
export function groupCommitsByTicket(
  results: RepoScanResult[],
  branchJiraKeys: Map<string, string>
): Map<string, Map<string, TicketWorkBundle>> {
  const bundles = new Map<string, Map<string, TicketWorkBundle>>();

  function addCommit(jiraKey: string, repoName: string, commit: CommitInfo) {
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
