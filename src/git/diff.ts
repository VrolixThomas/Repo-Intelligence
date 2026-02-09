import simpleGit from "simple-git";

export interface CommitDiff {
  sha: string;
  diff: string;
  truncated: boolean;
}

/**
 * Get the full diff for a specific commit.
 * Truncates if it exceeds maxLines.
 */
export async function getCommitDiff(
  repoPath: string,
  sha: string,
  maxLines: number = 500
): Promise<CommitDiff> {
  const git = simpleGit(repoPath);

  let diff: string;
  try {
    diff = await git.diff([`${sha}^..${sha}`]);
  } catch {
    // Possibly the first commit (no parent)
    try {
      diff = await git.diff([`${sha}`, "--root"]);
    } catch {
      diff = "(could not retrieve diff)";
    }
  }

  const lines = diff.split("\n");
  const truncated = lines.length > maxLines;

  return {
    sha,
    diff: truncated ? lines.slice(0, maxLines).join("\n") + "\n... (truncated)" : diff,
    truncated,
  };
}

/**
 * Get diffs for multiple commits in a repo.
 */
export async function getCommitDiffs(
  repoPath: string,
  shas: string[],
  maxLinesPerDiff: number = 500
): Promise<CommitDiff[]> {
  const diffs: CommitDiff[] = [];
  for (const sha of shas) {
    diffs.push(await getCommitDiff(repoPath, sha, maxLinesPerDiff));
  }
  return diffs;
}
