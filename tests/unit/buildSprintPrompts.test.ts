import { describe, it, expect } from "bun:test";
import { buildSprintTechnicalPrompt, buildSprintGeneralPrompt } from "../../src/claude/prompt";
import type { SprintSummaryInput } from "../../src/claude/prompt";

function makeSprintInput(overrides: Partial<SprintSummaryInput> = {}): SprintSummaryInput {
  return {
    sprintName: "Sprint 42",
    sprintGoal: "Complete auth overhaul",
    startDate: "2026-02-01",
    endDate: "2026-02-14",
    ticketSummaries: [
      { jiraKey: "PI-100", summaryText: "Refactored auth module to use JWT tokens.", repo: "my-repo" },
      { jiraKey: "PI-101", summaryText: "Added password reset flow.", repo: "my-repo" },
    ],
    memberContributions: [
      { name: "Alice Dev", commitCount: 25, ticketCount: 3, prsMerged: 2 },
      { name: "Bob QA", commitCount: 10, ticketCount: 2, prsMerged: 1 },
      { name: "Charlie Ops", commitCount: 0, ticketCount: 0, prsMerged: 0 },
    ],
    ticketStats: { total: 10, done: 6, inProgress: 2, inReview: 1, todo: 1 },
    prMetrics: { merged: 5, avgTimeToMergeHours: 12, avgReviewRounds: 2 },
    ...overrides,
  };
}

describe("buildSprintTechnicalPrompt", () => {
  it("includes sprint name and date range", () => {
    // Act
    const prompt = buildSprintTechnicalPrompt(makeSprintInput());

    // Assert
    expect(prompt).toContain('Sprint 42');
    expect(prompt).toContain("2026-02-01 to 2026-02-14");
  });

  it("includes sprint goal when provided", () => {
    // Act
    const prompt = buildSprintTechnicalPrompt(makeSprintInput());

    // Assert
    expect(prompt).toContain("Complete auth overhaul");
  });

  it("omits sprint goal section when null", () => {
    // Act
    const prompt = buildSprintTechnicalPrompt(makeSprintInput({ sprintGoal: null }));

    // Assert
    expect(prompt).not.toContain("Sprint Goal");
  });

  it("includes ticket stats", () => {
    // Act
    const prompt = buildSprintTechnicalPrompt(makeSprintInput());

    // Assert
    expect(prompt).toContain("10 total (6 done, 2 in progress, 1 in review, 1 todo)");
  });

  it("includes PR metrics", () => {
    // Act
    const prompt = buildSprintTechnicalPrompt(makeSprintInput());

    // Assert
    expect(prompt).toContain("PRs merged: 5");
    expect(prompt).toContain("avg 12h to merge");
    expect(prompt).toContain("2 review rounds");
  });

  it("filters out team members with 0 commits", () => {
    // Act
    const prompt = buildSprintTechnicalPrompt(makeSprintInput());

    // Assert
    expect(prompt).toContain("Alice Dev: 25 commits");
    expect(prompt).toContain("Bob QA: 10 commits");
    expect(prompt).not.toContain("Charlie Ops");
  });

  it("includes ticket summaries", () => {
    // Act
    const prompt = buildSprintTechnicalPrompt(makeSprintInput());

    // Assert
    expect(prompt).toContain("PI-100 (my-repo)");
    expect(prompt).toContain("Refactored auth module");
    expect(prompt).toContain("PI-101 (my-repo)");
  });

  it("truncates long ticket summaries to fit budget", () => {
    // Arrange
    const longSummaries = Array.from({ length: 200 }, (_, i) => ({
      jiraKey: `PI-${i}`,
      summaryText: "A".repeat(1000),
      repo: "repo",
    }));

    // Act
    const prompt = buildSprintTechnicalPrompt(makeSprintInput({ ticketSummaries: longSummaries }));

    // Assert
    // Should contain truncated summaries
    expect(prompt).toContain("...");
  });

  it("handles null dates gracefully", () => {
    // Act
    const prompt = buildSprintTechnicalPrompt(makeSprintInput({ startDate: null, endDate: null }));

    // Assert
    expect(prompt).toContain("? to ?");
  });
});

describe("buildSprintGeneralPrompt", () => {
  it("targets non-technical audience", () => {
    // Act
    const prompt = buildSprintGeneralPrompt(makeSprintInput(), "Tech summary here");

    // Assert
    expect(prompt).toContain("stakeholder-friendly");
    expect(prompt).toContain("non-technical readers");
  });

  it("includes sprint stats in plain language", () => {
    // Act
    const prompt = buildSprintGeneralPrompt(makeSprintInput(), "Tech summary");

    // Assert
    expect(prompt).toContain("6 of 10 tickets completed");
    expect(prompt).toContain("3 still in progress"); // inProgress(2) + inReview(1)
    expect(prompt).toContain("5 code changes merged");
  });

  it("includes technical summary as context", () => {
    // Arrange
    const techSummary = "We refactored the auth system and added JWT support.";

    // Act
    const prompt = buildSprintGeneralPrompt(makeSprintInput(), techSummary);

    // Assert
    expect(prompt).toContain("Technical Summary (for context)");
    expect(prompt).toContain(techSummary);
  });

  it("truncates long technical summaries to 3000 chars", () => {
    // Arrange
    const longTech = "X".repeat(5000);

    // Act
    const prompt = buildSprintGeneralPrompt(makeSprintInput(), longTech);

    // Assert
    expect(prompt).toContain("X".repeat(3000));
    expect(prompt).not.toContain("X".repeat(3001));
    expect(prompt).toContain("...");
  });

  it("includes sprint goal when provided", () => {
    // Act
    const prompt = buildSprintGeneralPrompt(makeSprintInput(), "tech");

    // Assert
    expect(prompt).toContain("Complete auth overhaul");
  });
});
