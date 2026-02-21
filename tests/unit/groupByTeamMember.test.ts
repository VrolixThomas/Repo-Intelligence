import { describe, it, expect } from "bun:test";
import { groupByTeamMember } from "../../src/git/author";
import { makeCommit, makeBranch } from "../fixtures/git-data";
import { testTeam } from "../fixtures/config";

describe("groupByTeamMember", () => {
  it("groups commits by author email to the correct team member", () => {
    // Arrange
    const commits = [
      makeCommit({ sha: "aaa", authorEmail: "alice@example.com", message: "commit 1" }),
      makeCommit({ sha: "bbb", authorEmail: "bob@example.com", message: "commit 2" }),
    ];

    // Act
    const result = groupByTeamMember(testTeam, [], commits);

    // Assert
    const alice = result.find((a) => a.memberName === "Alice Dev");
    const bob = result.find((a) => a.memberName === "Bob QA");
    expect(alice!.commits).toHaveLength(1);
    expect(alice!.commits[0]!.sha).toBe("aaa");
    expect(bob!.commits).toHaveLength(1);
    expect(bob!.commits[0]!.sha).toBe("bbb");
  });

  it("matches when commit email is already lowercase (scanner normalizes)", () => {
    // Note: groupByTeamMember lowercases the *map keys* but looks up commit.authorEmail as-is.
    // The git scanner already lowercases authorEmail, so in practice this always matches.

    // Arrange
    const commits = [
      makeCommit({ sha: "aaa", authorEmail: "alice@example.com" }),
    ];

    // Act
    const result = groupByTeamMember(testTeam, [], commits);

    // Assert
    const alice = result.find((a) => a.memberName === "Alice Dev");
    expect(alice!.commits).toHaveLength(1);
  });

  it("does not match mixed-case email (email map is lowercase-only)", () => {
    // This documents actual behavior: if authorEmail is not lowercased, it won't match.
    // In practice this doesn't happen because the scanner normalizes emails.

    // Arrange
    const commits = [
      makeCommit({ sha: "aaa", authorEmail: "Alice@Example.COM" }),
    ];

    // Act
    const result = groupByTeamMember(testTeam, [], commits);

    // Assert
    const alice = result.find((a) => a.memberName === "Alice Dev");
    expect(alice!.commits).toHaveLength(0);
    const unknown = result.find((a) => a.memberName === "Unknown");
    expect(unknown).toBeTruthy();
  });

  it("matches multiple emails for the same team member", () => {
    // Arrange
    const commits = [
      makeCommit({ sha: "aaa", authorEmail: "alice@example.com" }),
      makeCommit({ sha: "bbb", authorEmail: "alice.dev@company.com" }),
    ];

    // Act
    const result = groupByTeamMember(testTeam, [], commits);

    // Assert
    const alice = result.find((a) => a.memberName === "Alice Dev");
    expect(alice!.commits).toHaveLength(2);
  });

  it("puts unknown author commits in an 'Unknown' group", () => {
    // Arrange
    const commits = [
      makeCommit({ sha: "xxx", authorEmail: "stranger@external.com" }),
    ];

    // Act
    const result = groupByTeamMember(testTeam, [], commits);

    // Assert
    const unknown = result.find((a) => a.memberName === "Unknown");
    expect(unknown).toBeTruthy();
    expect(unknown!.commits).toHaveLength(1);
    expect(unknown!.emails).toEqual([]);
  });

  it("does not add Unknown group when all authors are team members", () => {
    // Arrange
    const commits = [
      makeCommit({ sha: "aaa", authorEmail: "alice@example.com" }),
    ];

    // Act
    const result = groupByTeamMember(testTeam, [], commits);

    // Assert
    const unknown = result.find((a) => a.memberName === "Unknown");
    expect(unknown).toBeUndefined();
  });

  it("assigns branches by lastCommitAuthorEmail", () => {
    // Arrange
    const branches = [
      makeBranch({ name: "feature/alice-branch", lastCommitAuthorEmail: "alice@example.com" }),
      makeBranch({ name: "feature/bob-branch", lastCommitAuthorEmail: "bob@example.com" }),
    ];

    // Act
    const result = groupByTeamMember(testTeam, branches, []);

    // Assert
    const alice = result.find((a) => a.memberName === "Alice Dev");
    const bob = result.find((a) => a.memberName === "Bob QA");
    expect(alice!.branches).toHaveLength(1);
    expect(alice!.branches[0]!.name).toBe("feature/alice-branch");
    expect(bob!.branches).toHaveLength(1);
  });

  it("puts unknown branch authors in Unknown group", () => {
    // Arrange
    const branches = [
      makeBranch({ name: "unknown-branch", lastCommitAuthorEmail: "stranger@external.com" }),
    ];

    // Act
    const result = groupByTeamMember(testTeam, branches, []);

    // Assert
    const unknown = result.find((a) => a.memberName === "Unknown");
    expect(unknown).toBeTruthy();
    expect(unknown!.branches).toHaveLength(1);
  });

  it("returns all team members even with no activity", () => {
    // Act
    const result = groupByTeamMember(testTeam, [], []);

    // Assert
    // Should have entries for all 3 team members, no Unknown
    expect(result).toHaveLength(3);
    expect(result.every((a) => a.commits.length === 0 && a.branches.length === 0)).toBe(true);
  });

  it("preserves team member emails in result", () => {
    // Act
    const result = groupByTeamMember(testTeam, [], []);

    // Assert
    const alice = result.find((a) => a.memberName === "Alice Dev");
    expect(alice!.emails).toEqual(["alice@example.com", "alice.dev@company.com"]);
  });

  it("handles empty team array", () => {
    // Arrange
    const commits = [makeCommit({ sha: "aaa" })];

    // Act
    const result = groupByTeamMember([], [], commits);

    // Assert
    // All commits should go to Unknown
    expect(result).toHaveLength(1);
    expect(result[0]!.memberName).toBe("Unknown");
  });
});
