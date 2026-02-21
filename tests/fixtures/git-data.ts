/**
 * Shared test fixtures for git-related data structures.
 */
import type { CommitInfo, BranchInfo, RepoScanResult } from "../../src/git/scanner";

export function makeCommit(overrides: Partial<CommitInfo> = {}): CommitInfo {
  return {
    sha: "abc1234567890def1234567890abcdef12345678",
    shortSha: "abc12345",
    authorName: "Alice Dev",
    authorEmail: "alice@example.com",
    date: "2026-02-15T10:00:00Z",
    message: "fix: resolve PI-123 login bug",
    branch: "feature/PI-123-login-fix",
    repo: "my-repo",
    filesChanged: 3,
    insertions: 42,
    deletions: 10,
    diffStat: "  src/auth.ts | +30 -5\n  src/utils.ts | +12 -5",
    jiraKeys: ["PI-123"],
    ...overrides,
  };
}

export function makeBranch(overrides: Partial<BranchInfo> = {}): BranchInfo {
  return {
    name: "feature/PI-123-login-fix",
    remote: "origin",
    lastCommitSha: "abc1234567890def1234567890abcdef12345678",
    lastCommitDate: "2026-02-15T10:00:00Z",
    lastCommitAuthorEmail: "alice@example.com",
    lastCommitMessage: "fix: resolve PI-123 login bug",
    ...overrides,
  };
}

export function makeRepoScanResult(overrides: Partial<RepoScanResult> = {}): RepoScanResult {
  return {
    repoName: "my-repo",
    repoPath: "/path/to/my-repo",
    branches: [makeBranch()],
    commits: [makeCommit()],
    errors: [],
    ...overrides,
  };
}
