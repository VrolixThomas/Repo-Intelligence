import { describe, it, expect } from "bun:test";
import { buildPrompt } from "../../src/claude/prompt";
import type { PromptInput, TicketContext } from "../../src/claude/prompt";
import { makeCommit, makeBranch } from "../fixtures/git-data";

function makePromptInput(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    repoName: "my-repo",
    memberName: "Alice Dev",
    commits: [
      makeCommit({ sha: "aaa", shortSha: "aaa12345", message: "fix: auth check" }),
      makeCommit({ sha: "bbb", shortSha: "bbb12345", message: "feat: add logout" }),
    ],
    branches: [makeBranch({ name: "feature/PI-123-login-fix" })],
    tickets: [],
    ...overrides,
  };
}

describe("buildPrompt (member-centric)", () => {
  it("includes repo name and member name", () => {
    // Act
    const prompt = buildPrompt(makePromptInput());

    // Assert
    expect(prompt).toContain('"my-repo" repository');
    expect(prompt).toContain("team member Alice Dev");
  });

  it("includes commit sections", () => {
    // Act
    const prompt = buildPrompt(makePromptInput());

    // Assert
    expect(prompt).toContain("Commits (2 total)");
    expect(prompt).toContain("aaa12345 — fix: auth check");
    expect(prompt).toContain("bbb12345 — feat: add logout");
  });

  it("includes active branches section", () => {
    // Act
    const prompt = buildPrompt(makePromptInput());

    // Assert
    expect(prompt).toContain("Active Branches (1)");
    expect(prompt).toContain("feature/PI-123-login-fix (Jira: PI-123)");
  });

  it("extracts Jira key from branch name for display", () => {
    // Arrange
    const input = makePromptInput({
      branches: [makeBranch({ name: "feature/INFRA-456-deploy" })],
    });

    // Act
    const prompt = buildPrompt(input);

    // Assert
    expect(prompt).toContain("(Jira: INFRA-456)");
  });

  it("includes Jira ticket context section when tickets provided", () => {
    // Arrange
    const ticket: TicketContext = {
      jiraKey: "PI-123",
      summary: "Fix login",
      description: "Desc",
      status: "In Progress",
      assignee: "Alice",
      priority: "High",
      ticketType: "Bug",
      commentsJson: null,
    };

    // Act
    const prompt = buildPrompt(makePromptInput({ tickets: [ticket] }));

    // Assert
    expect(prompt).toContain("Jira Ticket Context");
    expect(prompt).toContain("PI-123: Fix login");
  });

  it("omits ticket section when no tickets", () => {
    // Act
    const prompt = buildPrompt(makePromptInput({ tickets: [] }));

    // Assert
    expect(prompt).not.toContain("Jira Ticket Context");
  });

  it("handles incremental mode — shows only new commits", () => {
    // Arrange
    const input = makePromptInput({
      previousSummary: {
        text: "Previous analysis",
        createdAt: "2026-02-14T10:00:00Z",
        commitShas: ["aaa"],
      },
    });

    // Act
    const prompt = buildPrompt(input);

    // Assert
    expect(prompt).toContain("Previous Analysis");
    expect(prompt).toContain("1 new, 1 already analyzed");
    // Should show only new commit bbb
    expect(prompt).toContain("Commits (1 total, new only)");
  });

  it("drops per-commit diffs when exceeding 50K (stage 1)", () => {
    // Arrange
    const hugeDiff = "z".repeat(60_000);
    const input = makePromptInput({
      diffs: [{ sha: "aaa", diff: hugeDiff, truncated: false }],
    });

    // Act
    const prompt = buildPrompt(input);

    // Assert
    expect(prompt).not.toContain(hugeDiff);
    expect(prompt).toContain("Per-commit diffs omitted for size");
  });

  it("drops branch diffs when still too large (stage 2)", () => {
    // Arrange
    const hugeBranchDiff = "w".repeat(60_000);
    const input = makePromptInput({
      branchDiffs: [
        {
          branchName: "feature/PI-123",
          baseBranch: "main",
          baseSource: "pr",
          aggregateStat: null,
          aggregateDiff: hugeBranchDiff,
          aggregateDiffTruncated: false,
        },
      ],
    });

    // Act
    const prompt = buildPrompt(input);

    // Assert
    expect(prompt).not.toContain(hugeBranchDiff);
    expect(prompt).toContain("All diffs omitted for size");
  });

  it("includes checked-out branch note", () => {
    // Arrange
    const input = makePromptInput({ checkedOutBranch: "feature/PI-123-login-fix" });

    // Act
    const prompt = buildPrompt(input);

    // Assert
    expect(prompt).toContain("currently on branch `feature/PI-123-login-fix`");
  });

  it("omits branches section when no branches", () => {
    // Arrange
    const input = makePromptInput({ branches: [] });

    // Act
    const prompt = buildPrompt(input);

    // Assert
    expect(prompt).not.toContain("Active Branches");
  });
});
