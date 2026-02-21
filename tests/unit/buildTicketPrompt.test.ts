import { describe, it, expect } from "bun:test";
import { buildTicketPrompt } from "../../src/claude/prompt";
import type { TicketPromptInput, TicketContext } from "../../src/claude/prompt";
import { makeCommit } from "../fixtures/git-data";

function makeTicketPromptInput(overrides: Partial<TicketPromptInput> = {}): TicketPromptInput {
  return {
    jiraKey: "PI-123",
    repoName: "my-repo",
    ticket: {
      jiraKey: "PI-123",
      summary: "Fix login bug",
      description: "Users see errors",
      status: "In Progress",
      assignee: "Alice Dev",
      priority: "High",
      ticketType: "Bug",
      commentsJson: null,
    },
    branches: [
      {
        branchName: "feature/PI-123-login-fix",
        prInfo: { prId: 42, prState: "OPEN", prTargetBranch: "main", prApprovals: 1 },
        commits: [
          makeCommit({ sha: "aaa", shortSha: "aaa12345", message: "fix: auth check" }),
          makeCommit({ sha: "bbb", shortSha: "bbb12345", message: "test: add auth test" }),
        ],
        authorEmails: ["alice@example.com"],
      },
    ],
    ...overrides,
  };
}

describe("buildTicketPrompt", () => {
  it("includes Jira ticket context for real keys", () => {
    // Act
    const prompt = buildTicketPrompt(makeTicketPromptInput());

    // Assert
    expect(prompt).toContain("analyzing git activity for Jira ticket PI-123");
    expect(prompt).toContain("PI-123: Fix login bug");
    expect(prompt).toContain("Type: Bug | Status: In Progress");
  });

  it("uses orphan mode for branch: pseudo-keys", () => {
    // Arrange
    const input = makeTicketPromptInput({
      jiraKey: "branch:feature/no-ticket",
      ticket: null,
    });

    // Act
    const prompt = buildTicketPrompt(input);

    // Assert
    expect(prompt).toContain("analyzing recent git activity on branch `feature/no-ticket`");
    expect(prompt).toContain("not associated with any Jira ticket");
    expect(prompt).not.toContain("Ticket Context");
  });

  it("includes branch and PR info", () => {
    // Act
    const prompt = buildTicketPrompt(makeTicketPromptInput());

    // Assert
    expect(prompt).toContain("Branch: feature/PI-123-login-fix");
    expect(prompt).toContain("PR: #42 (OPEN) -> main | 1 approval(s)");
  });

  it("shows 'No PR' when branch has no PR", () => {
    // Arrange
    const input = makeTicketPromptInput({
      branches: [
        {
          branchName: "feature/PI-123-login-fix",
          prInfo: null,
          commits: [makeCommit()],
          authorEmails: ["alice@example.com"],
        },
      ],
    });

    // Act
    const prompt = buildTicketPrompt(input);

    // Assert
    expect(prompt).toContain("No PR");
  });

  it("includes commit details", () => {
    // Act
    const prompt = buildTicketPrompt(makeTicketPromptInput());

    // Assert
    expect(prompt).toContain("aaa12345 — fix: auth check");
    expect(prompt).toContain("bbb12345 — test: add auth test");
  });

  it("includes contributor names from commits", () => {
    // Act
    const prompt = buildTicketPrompt(makeTicketPromptInput());

    // Assert
    expect(prompt).toContain("Contributor(s): Alice Dev");
  });

  it("filters to new commits only in incremental mode", () => {
    // Arrange
    const input = makeTicketPromptInput({
      previousSummary: {
        text: "Previous analysis text",
        createdAt: "2026-02-14T10:00:00Z",
        commitShas: ["aaa"], // "aaa" was already analyzed
      },
    });

    // Act
    const prompt = buildTicketPrompt(input);

    // Assert
    expect(prompt).toContain("Previous Analysis");
    expect(prompt).toContain("1 new commits, 1 already analyzed");
    // Should include "bbb" (new) but still show in the commit section
    expect(prompt).toContain("bbb12345");
  });

  it("skips branches with no new commits in incremental mode", () => {
    // Arrange
    const input = makeTicketPromptInput({
      branches: [
        {
          branchName: "feature/PI-123-login-fix",
          prInfo: null,
          commits: [makeCommit({ sha: "old-sha" })],
          authorEmails: ["alice@example.com"],
        },
      ],
      previousSummary: {
        text: "Old summary",
        createdAt: "2026-02-14T10:00:00Z",
        commitShas: ["old-sha"],
      },
    });

    // Act
    const prompt = buildTicketPrompt(input);

    // Assert
    // The branch section should be skipped since all commits are old
    expect(prompt).not.toContain("Branch: feature/PI-123-login-fix");
  });

  it("includes checked-out branch note", () => {
    // Arrange
    const input = makeTicketPromptInput({ checkedOutBranch: "feature/PI-123-login-fix" });

    // Act
    const prompt = buildTicketPrompt(input);

    // Assert
    expect(prompt).toContain("currently on branch `feature/PI-123-login-fix`");
  });

  it("drops per-commit diffs when prompt exceeds 50K chars (stage 1)", () => {
    // Arrange
    // Create a huge diff to push over the limit
    const hugeDiff = "x".repeat(60_000);
    const input = makeTicketPromptInput({
      diffs: [{ sha: "aaa", diff: hugeDiff, truncated: false }],
    });

    // Act
    const prompt = buildTicketPrompt(input);

    // Assert
    expect(prompt).not.toContain(hugeDiff);
    expect(prompt).toContain("Per-commit diffs omitted for size");
  });

  it("drops all diffs when still over 50K after stage 1 (stage 2)", () => {
    // Arrange
    // Create huge branch diffs
    const hugeAggDiff = "y".repeat(60_000);
    const input = makeTicketPromptInput({
      branchDiffs: [
        {
          branchName: "feature/PI-123-login-fix",
          baseBranch: "main",
          baseSource: "pr",
          aggregateStat: null,
          aggregateDiff: hugeAggDiff,
          aggregateDiffTruncated: false,
        },
      ],
    });

    // Act
    const prompt = buildTicketPrompt(input);

    // Assert
    expect(prompt).not.toContain(hugeAggDiff);
    expect(prompt).toContain("All diffs omitted for size");
  });

  it("does not include ticket context section for orphan keys", () => {
    // Arrange
    const input = makeTicketPromptInput({
      jiraKey: "branch:hotfix",
      ticket: {
        jiraKey: "branch:hotfix",
        summary: "not a real ticket",
        description: null,
        status: null,
        assignee: null,
        priority: null,
        ticketType: null,
        commentsJson: null,
      },
    });

    // Act
    const prompt = buildTicketPrompt(input);

    // Assert
    expect(prompt).not.toContain("Ticket Context");
  });

  it("includes aggregate branch diffs section", () => {
    // Arrange
    const input = makeTicketPromptInput({
      branchDiffs: [
        {
          branchName: "feature/PI-123-login-fix",
          baseBranch: "main",
          baseSource: "pr",
          aggregateStat: "3 files changed",
          aggregateDiff: "+added\n-removed",
          aggregateDiffTruncated: false,
        },
      ],
    });

    // Act
    const prompt = buildTicketPrompt(input);

    // Assert
    expect(prompt).toContain("Aggregate Branch Diffs");
    expect(prompt).toContain("3 files changed");
  });
});
