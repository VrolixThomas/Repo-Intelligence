/**
 * Branch context utilities for checkout + aggregate diffs.
 *
 * Provides: PR target detection, base branch resolution, aggregate diffs,
 * and safe checkout/restore for giving Claude access to feature branch code.
 */

import simpleGit from "simple-git";

export interface BranchDiffContext {
  branchName: string;
  baseBranch: string | null;       // e.g. "dev" — null if no base found
  baseSource: "pr" | "fallback" | "none";
  aggregateDiff: string | null;
  aggregateDiffTruncated: boolean;
  aggregateStat: string | null;    // --stat summary
}

export interface RepoState {
  ref: string;       // branch name or detached SHA
  isDetached: boolean;
}

const BLOCKED_BASES = new Set(["master", "main"]);

/**
 * Fetch latest from all remotes (ensures we have up-to-date refs).
 */
export async function fetchLatest(repoPath: string): Promise<void> {
  const git = simpleGit(repoPath);
  await git.fetch(["--all", "--prune"]);
}

/**
 * Try to detect the PR target branch using `gh pr list`.
 * Returns null if gh is not installed, no PR exists, or parse fails.
 */
export async function detectPrTargetBranch(
  repoPath: string,
  branchName: string
): Promise<string | null> {
  try {
    const proc = Bun.spawn(
      ["gh", "pr", "list", "--head", branchName, "--json", "baseRefName", "--limit", "1"],
      { cwd: repoPath, stdout: "pipe", stderr: "pipe" }
    );

    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;

    const stdout = await new Response(proc.stdout as ReadableStream).text();
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const base = parsed[0]?.baseRefName;
    if (typeof base !== "string" || base.length === 0) return null;

    return base;
  } catch {
    return null;
  }
}

/**
 * Resolve the base branch for aggregate diff.
 * Priority: PR target → check if origin/dev exists → null.
 * NEVER returns master or main.
 */
export async function resolveBaseBranch(
  repoPath: string,
  branchName: string
): Promise<{ baseBranch: string | null; source: "pr" | "fallback" | "none" }> {
  // Try PR target first
  const prTarget = await detectPrTargetBranch(repoPath, branchName);
  if (prTarget && !BLOCKED_BASES.has(prTarget)) {
    return { baseBranch: prTarget, source: "pr" };
  }

  // Fallback: check if origin/dev exists
  const git = simpleGit(repoPath);
  try {
    await git.raw(["rev-parse", "--verify", "origin/dev"]);
    return { baseBranch: "dev", source: "fallback" };
  } catch {
    // No dev branch
  }

  return { baseBranch: null, source: "none" };
}

/**
 * Get the aggregate diff between a feature branch and its base.
 * Uses three-dot diff (changes since branch diverged).
 */
export async function getAggregateBranchDiff(
  repoPath: string,
  branchName: string,
  baseBranch: string,
  maxLines: number = 500
): Promise<BranchDiffContext> {
  const git = simpleGit(repoPath);
  const result: BranchDiffContext = {
    branchName,
    baseBranch,
    baseSource: "none", // caller should override
    aggregateDiff: null,
    aggregateDiffTruncated: false,
    aggregateStat: null,
  };

  try {
    // --stat summary
    result.aggregateStat = await git.raw([
      "diff", "--stat", `origin/${baseBranch}...origin/${branchName}`,
    ]);
  } catch {
    // Branch may not exist on remote
    return result;
  }

  try {
    const fullDiff = await git.raw([
      "diff", `origin/${baseBranch}...origin/${branchName}`,
    ]);

    const lines = fullDiff.split("\n");
    if (lines.length > maxLines) {
      result.aggregateDiff = lines.slice(0, maxLines).join("\n") + "\n... (truncated)";
      result.aggregateDiffTruncated = true;
    } else {
      result.aggregateDiff = fullDiff;
    }
  } catch {
    // Diff failed — stat may still be useful
  }

  return result;
}

/**
 * Record current repo state (branch or detached HEAD) for later restoration.
 */
export async function recordRepoState(repoPath: string): Promise<RepoState> {
  const git = simpleGit(repoPath);

  try {
    const ref = (await git.raw(["symbolic-ref", "--short", "HEAD"])).trim();
    return { ref, isDetached: false };
  } catch {
    // Detached HEAD — fall back to SHA
    const sha = (await git.raw(["rev-parse", "HEAD"])).trim();
    return { ref: sha, isDetached: true };
  }
}

/**
 * Checkout a branch in detached HEAD mode (no local branch pollution).
 * Returns { ok: false } gracefully on failure (dirty tree, missing branch).
 */
export async function checkoutBranch(
  repoPath: string,
  branchName: string
): Promise<{ ok: boolean; error?: string }> {
  const git = simpleGit(repoPath);

  try {
    await git.raw(["checkout", `origin/${branchName}`, "--detach"]);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message ?? String(err) };
  }
}

/**
 * Restore repo to a previously recorded state.
 */
export async function restoreRepoState(
  repoPath: string,
  state: RepoState
): Promise<void> {
  const git = simpleGit(repoPath);

  try {
    if (state.isDetached) {
      await git.raw(["checkout", state.ref, "--detach"]);
    } else {
      await git.raw(["checkout", state.ref]);
    }
  } catch (err: any) {
    console.warn(`  Warning: failed to restore repo state: ${err.message}`);
  }
}
