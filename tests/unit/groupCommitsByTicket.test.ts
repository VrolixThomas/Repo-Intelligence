import { describe, it, expect } from "bun:test";
import { groupCommitsByTicket, type TicketWorkBundle } from "../../src/git/group-commits";
import { makeCommit, makeRepoScanResult } from "../fixtures/git-data";

describe("groupCommitsByTicket", () => {
  it("groups a commit under its message jiraKey", () => {
    // Arrange
    const commit = makeCommit({ jiraKeys: ["PI-100"] });
    const results = [makeRepoScanResult({ commits: [commit] })];

    // Act
    const bundles = groupCommitsByTicket(results, new Map());

    // Assert
    expect(bundles.has("PI-100")).toBe(true);
    const repoMap = bundles.get("PI-100")!;
    expect(repoMap.has("my-repo")).toBe(true);
    const work = repoMap.get("my-repo")!;
    expect(work.commits).toHaveLength(1);
    expect(work.commits[0]!.sha).toBe(commit.sha);
  });

  it("groups a commit under its branch jiraKey from branchJiraKeys map", () => {
    // Arrange
    const commit = makeCommit({ jiraKeys: [], branch: "feature/login" });
    const results = [makeRepoScanResult({ commits: [commit] })];
    const branchKeys = new Map([["my-repo::feature/login", "PI-200"]]);

    // Act
    const bundles = groupCommitsByTicket(results, branchKeys);

    // Assert
    expect(bundles.has("PI-200")).toBe(true);
    expect(bundles.get("PI-200")!.get("my-repo")!.commits).toHaveLength(1);
  });

  it("assigns a commit to both branch key and message key", () => {
    // Arrange
    const commit = makeCommit({ jiraKeys: ["PI-300"], branch: "feature/login" });
    const results = [makeRepoScanResult({ commits: [commit] })];
    const branchKeys = new Map([["my-repo::feature/login", "PI-400"]]);

    // Act
    const bundles = groupCommitsByTicket(results, branchKeys);

    // Assert
    expect(bundles.has("PI-300")).toBe(true);
    expect(bundles.has("PI-400")).toBe(true);
    // Same commit appears under both keys
    expect(bundles.get("PI-300")!.get("my-repo")!.commits[0]!.sha).toBe(commit.sha);
    expect(bundles.get("PI-400")!.get("my-repo")!.commits[0]!.sha).toBe(commit.sha);
  });

  it("groups orphan commits under branch: pseudo-key", () => {
    // Arrange
    const commit = makeCommit({ jiraKeys: [], branch: "hotfix/no-ticket" });
    const results = [makeRepoScanResult({ commits: [commit] })];

    // Act
    const bundles = groupCommitsByTicket(results, new Map());

    // Assert
    expect(bundles.has("branch:hotfix/no-ticket")).toBe(true);
    expect(bundles.get("branch:hotfix/no-ticket")!.get("my-repo")!.commits).toHaveLength(1);
  });

  it("deduplicates commits with the same SHA", () => {
    // Arrange
    const commit = makeCommit({ sha: "dupe123", jiraKeys: ["PI-500"] });
    // Same commit appearing twice (e.g. from different branches)
    const results = [makeRepoScanResult({ commits: [commit, commit] })];

    // Act
    const bundles = groupCommitsByTicket(results, new Map());

    // Assert
    expect(bundles.get("PI-500")!.get("my-repo")!.commits).toHaveLength(1);
  });

  it("collects branch names from commits", () => {
    // Arrange
    const c1 = makeCommit({ jiraKeys: ["PI-600"], branch: "feature/a" });
    const c2 = makeCommit({ sha: "def5678", jiraKeys: ["PI-600"], branch: "feature/b" });
    const results = [makeRepoScanResult({ commits: [c1, c2] })];

    // Act
    const bundles = groupCommitsByTicket(results, new Map());

    // Assert
    const work = bundles.get("PI-600")!.get("my-repo")!;
    expect(work.branchNames.has("feature/a")).toBe(true);
    expect(work.branchNames.has("feature/b")).toBe(true);
  });

  it("collects author emails from commits", () => {
    // Arrange
    const c1 = makeCommit({ jiraKeys: ["PI-700"], authorEmail: "alice@dev.com" });
    const c2 = makeCommit({ sha: "xyz999", jiraKeys: ["PI-700"], authorEmail: "bob@dev.com" });
    const results = [makeRepoScanResult({ commits: [c1, c2] })];

    // Act
    const bundles = groupCommitsByTicket(results, new Map());

    // Assert
    const work = bundles.get("PI-700")!.get("my-repo")!;
    expect(work.authorEmails.has("alice@dev.com")).toBe(true);
    expect(work.authorEmails.has("bob@dev.com")).toBe(true);
  });

  it("handles multiple repos separately", () => {
    // Arrange
    const c1 = makeCommit({ jiraKeys: ["PI-800"] });
    const c2 = makeCommit({ sha: "repo2sha", jiraKeys: ["PI-800"] });
    const results = [
      makeRepoScanResult({ repoName: "repo-a", commits: [c1] }),
      makeRepoScanResult({ repoName: "repo-b", commits: [c2] }),
    ];

    // Act
    const bundles = groupCommitsByTicket(results, new Map());

    // Assert
    const repoMap = bundles.get("PI-800")!;
    expect(repoMap.has("repo-a")).toBe(true);
    expect(repoMap.has("repo-b")).toBe(true);
  });

  it("handles empty results", () => {
    // Act & Assert
    const bundles = groupCommitsByTicket([], new Map());
    expect(bundles.size).toBe(0);
  });

  it("handles multiple jiraKeys in a single commit", () => {
    // Arrange
    const commit = makeCommit({ jiraKeys: ["PI-900", "PI-901"] });
    const results = [makeRepoScanResult({ commits: [commit] })];

    // Act
    const bundles = groupCommitsByTicket(results, new Map());

    // Assert
    expect(bundles.has("PI-900")).toBe(true);
    expect(bundles.has("PI-901")).toBe(true);
  });

  it("branch key takes priority — appears even when commit has message keys", () => {
    // Arrange
    const commit = makeCommit({ jiraKeys: ["PI-1000"], branch: "feature/x" });
    const results = [makeRepoScanResult({ commits: [commit] })];
    const branchKeys = new Map([["my-repo::feature/x", "PI-1001"]]);

    // Act
    const bundles = groupCommitsByTicket(results, branchKeys);

    // Assert
    // Both the branch key AND the message key should be present
    expect(bundles.has("PI-1001")).toBe(true);
    expect(bundles.has("PI-1000")).toBe(true);
  });
});
