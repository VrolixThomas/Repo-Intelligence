import { describe, it, expect } from "bun:test";
import { formatCommit, formatTicket, formatBranchDiff } from "../../src/claude/prompt";
import type { TicketContext } from "../../src/claude/prompt";
import type { BranchDiffContext } from "../../src/git/branch-context";
import { makeCommit } from "../fixtures/git-data";

describe("formatCommit", () => {
  it("formats a commit with basic info", () => {
    // Arrange
    const commit = makeCommit({ shortSha: "abc12345", message: "fix: login bug\nExtra detail" });

    // Act
    const result = formatCommit(commit);

    // Assert
    expect(result).toContain("### abc12345 — fix: login bug");
    expect(result).toContain("- Branch: feature/PI-123-login-fix");
    expect(result).toContain("- Date: 2026-02-15T10:00:00Z");
    expect(result).toContain("- Stats: 3 files, +42/-10");
  });

  it("includes diffStat when present", () => {
    // Arrange
    const commit = makeCommit({ diffStat: "  src/auth.ts | +30 -5" });

    // Act
    const result = formatCommit(commit);

    // Assert
    expect(result).toContain("- Diff stat:");
    expect(result).toContain("src/auth.ts | +30 -5");
  });

  it("includes diff when provided", () => {
    // Arrange
    const commit = makeCommit();
    const diff = { sha: commit.sha, diff: "+added line\n-removed line", truncated: false };

    // Act
    const result = formatCommit(commit, diff);

    // Assert
    expect(result).toContain("```diff");
    expect(result).toContain("+added line");
  });

  it("omits diff section when no diff provided", () => {
    // Arrange
    const commit = makeCommit({ diffStat: "" });

    // Act
    const result = formatCommit(commit);

    // Assert
    expect(result).not.toContain("```diff");
  });

  it("uses only first line of multi-line message in header", () => {
    // Arrange
    const commit = makeCommit({ message: "first line\nsecond line\nthird line" });

    // Act
    const result = formatCommit(commit);

    // Assert
    expect(result).toContain("### abc12345 — first line");
    expect(result).not.toContain("second line");
  });
});

describe("formatTicket", () => {
  it("formats ticket with all fields", () => {
    // Arrange
    const ticket: TicketContext = {
      jiraKey: "PI-456",
      summary: "Fix login timeout",
      description: "Users see timeout errors on login page",
      status: "In Progress",
      assignee: "Alice Dev",
      priority: "High",
      ticketType: "Bug",
      commentsJson: null,
    };

    // Act
    const result = formatTicket(ticket);

    // Assert
    expect(result).toContain("### PI-456: Fix login timeout");
    expect(result).toContain("Type: Bug | Status: In Progress | Priority: High");
    expect(result).toContain("- Assignee: Alice Dev");
    expect(result).toContain("- Description: Users see timeout errors");
  });

  it("truncates long descriptions at 500 chars", () => {
    // Arrange
    const longDesc = "A".repeat(600);
    const ticket: TicketContext = {
      jiraKey: "PI-1",
      summary: "Test",
      description: longDesc,
      status: null,
      assignee: null,
      priority: null,
      ticketType: null,
      commentsJson: null,
    };

    // Act
    const result = formatTicket(ticket);

    // Assert
    expect(result).toContain("A".repeat(500) + "...");
    expect(result).not.toContain("A".repeat(501));
  });

  it("shows last 3 comments from commentsJson", () => {
    // Arrange
    const comments = [
      { author: "User1", date: "2026-02-10T10:00:00Z", body: "Comment 1" },
      { author: "User2", date: "2026-02-11T10:00:00Z", body: "Comment 2" },
      { author: "User3", date: "2026-02-12T10:00:00Z", body: "Comment 3" },
      { author: "User4", date: "2026-02-13T10:00:00Z", body: "Comment 4" },
    ];
    const ticket: TicketContext = {
      jiraKey: "PI-1",
      summary: "Test",
      description: null,
      status: null,
      assignee: null,
      priority: null,
      ticketType: null,
      commentsJson: JSON.stringify(comments),
    };

    // Act
    const result = formatTicket(ticket);

    // Assert
    expect(result).toContain("Recent comments:");
    // slice(-3) gives last 3
    expect(result).toContain("User2");
    expect(result).toContain("User3");
    expect(result).toContain("User4");
    expect(result).not.toContain("User1");
  });

  it("handles null fields gracefully", () => {
    // Arrange
    const ticket: TicketContext = {
      jiraKey: "PI-1",
      summary: null,
      description: null,
      status: null,
      assignee: null,
      priority: null,
      ticketType: null,
      commentsJson: null,
    };

    // Act
    const result = formatTicket(ticket);

    // Assert
    expect(result).toContain("### PI-1: (no summary)");
    expect(result).toContain("Type: ? | Status: ? | Priority: ?");
    expect(result).not.toContain("Assignee");
    expect(result).not.toContain("Description");
  });
});

describe("formatBranchDiff", () => {
  it("formats a branch diff with PR source", () => {
    // Arrange
    const bd: BranchDiffContext = {
      branchName: "feature/login",
      baseBranch: "main",
      baseSource: "pr",
      aggregateStat: "5 files changed, +100 -20",
      aggregateDiff: "+added\n-removed",
      aggregateDiffTruncated: false,
    };

    // Act
    const result = formatBranchDiff(bd);

    // Assert
    expect(result).toContain("### feature/login vs main (source: from PR)");
    expect(result).toContain("5 files changed");
    expect(result).toContain("+added");
  });

  it("shows truncation notice when diff is truncated", () => {
    // Arrange
    const bd: BranchDiffContext = {
      branchName: "feature/big",
      baseBranch: "main",
      baseSource: "pr",
      aggregateStat: null,
      aggregateDiff: "+huge diff",
      aggregateDiffTruncated: true,
    };

    // Act
    const result = formatBranchDiff(bd);

    // Assert
    expect(result).toContain("Aggregate diff was truncated");
  });

  it("labels fallback source correctly", () => {
    // Arrange
    const bd: BranchDiffContext = {
      branchName: "feature/x",
      baseBranch: "develop",
      baseSource: "fallback",
      aggregateStat: null,
      aggregateDiff: null,
      aggregateDiffTruncated: false,
    };

    // Act
    const result = formatBranchDiff(bd);

    // Assert
    expect(result).toContain("(source: fallback)");
  });
});
