import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock the DB queries module before importing generateReport
mock.module("../../src/db/queries", () => ({
  getTicketSummariesForRun: mock(() => Promise.resolve([])),
  getCommitsForRun: mock(() => Promise.resolve([])),
  getTicketsByKeys: mock(() => Promise.resolve([])),
  getRunById: mock(() => Promise.resolve(null)),
}));

import { generateReport, type ReportInput } from "../../src/report/generate";
import { testConfig } from "../fixtures/config";

// Re-import the mocked functions so we can configure them per test
const queries = await import("../../src/db/queries");
const mockGetTicketSummaries = queries.getTicketSummariesForRun as ReturnType<typeof mock>;
const mockGetCommitsForRun = queries.getCommitsForRun as ReturnType<typeof mock>;
const mockGetTicketsByKeys = queries.getTicketsByKeys as ReturnType<typeof mock>;
const mockGetRunById = queries.getRunById as ReturnType<typeof mock>;

describe("generateReport", () => {
  const baseInput: ReportInput = {
    runId: 1,
    config: testConfig,
    repoResults: [
      {
        repoName: "my-repo",
        branches: [],
        commits: [],
        defaultBranch: "main",
        repoPath: "/tmp/my-repo",
      },
    ],
    totalNewCommits: 5,
    totalExisting: 10,
  };

  beforeEach(() => {
    mockGetTicketSummaries.mockReset();
    mockGetCommitsForRun.mockReset();
    mockGetTicketsByKeys.mockReset();
    mockGetRunById.mockReset();

    // Set up default returns
    mockGetTicketSummaries.mockImplementation(() => Promise.resolve([]));
    mockGetCommitsForRun.mockImplementation(() => Promise.resolve([]));
    mockGetTicketsByKeys.mockImplementation(() => Promise.resolve([]));
    mockGetRunById.mockImplementation(() =>
      Promise.resolve({ id: 1, startedAt: "2026-02-15T10:00:00Z" })
    );
  });

  it("generates a markdown report with header", async () => {
    // Act
    const result = await generateReport(baseInput);

    // Assert
    expect(result.markdown).toContain("# Daily Activity Report");
    expect(result.markdown).toContain("2026-02-15");
  });

  it("includes commit count and run number in header", async () => {
    // Act
    const result = await generateReport(baseInput);

    // Assert
    expect(result.markdown).toContain("5 new commits");
    expect(result.markdown).toContain("Run #1");
  });

  it("creates the report file path with date and run id", async () => {
    // Act
    const result = await generateReport(baseInput);

    // Assert
    expect(result.filePath).toContain("run-1");
    expect(result.filePath).toContain(".md");
  });

  it("includes ticket summaries when available", async () => {
    // Arrange
    mockGetTicketSummaries.mockImplementation(() =>
      Promise.resolve([
        {
          id: 1,
          runId: 1,
          jiraKey: "PI-123",
          repo: "my-repo",
          summaryText: "Fixed the login flow by adding token refresh",
          authorEmails: "alice@dev.com",
          branchNames: '["feature/PI-123"]',
          claudeSessionId: null,
          createdAt: "2026-02-15T10:00:00Z",
        },
      ])
    );

    // Act
    const result = await generateReport(baseInput);

    // Assert
    expect(result.markdown).toContain("PI-123");
    expect(result.markdown).toContain("Fixed the login flow");
  });

  it("includes commit table when commits and summaries match", async () => {
    // Arrange
    // Need both ticket summary AND commits for the commit table to appear
    mockGetTicketSummaries.mockImplementation(() =>
      Promise.resolve([
        {
          id: 1,
          runId: 1,
          jiraKey: "PI-123",
          repo: "my-repo",
          summaryText: "Fixed login bug",
          authorEmails: "alice@dev.com",
          branchNames: '["feature/PI-123"]',
          claudeSessionId: null,
          createdAt: "2026-02-15T10:00:00Z",
        },
      ])
    );

    mockGetCommitsForRun.mockImplementation(() =>
      Promise.resolve([
        {
          id: 1,
          sha: "abc1234567890",
          shortSha: "abc1234",
          authorName: "Alice Dev",
          authorEmail: "alice@dev.com",
          message: "fix: resolve login bug",
          branch: "feature/PI-123",
          repo: "my-repo",
          timestamp: "2026-02-15T10:00:00Z",
          jiraKeys: "PI-123",
          filesChanged: 3,
          insertions: 10,
          deletions: 2,
          diffStat: "+10 -2",
          diffSummary: null,
          firstSeenRun: 1,
        },
      ])
    );

    // Act
    const result = await generateReport(baseInput);

    // Assert
    expect(result.markdown).toContain("abc1234");
    expect(result.markdown).toContain("+10/-2");
  });

  it("includes ticket index when commits reference tickets", async () => {
    // Arrange
    mockGetCommitsForRun.mockImplementation(() =>
      Promise.resolve([
        {
          id: 1,
          sha: "abc123",
          shortSha: "abc12",
          authorName: "Alice",
          authorEmail: "alice@dev.com",
          message: "fix: PI-456 login",
          branch: "main",
          repo: "my-repo",
          timestamp: "2026-02-15T10:00:00Z",
          jiraKeys: "PI-456",
          filesChanged: 1,
          insertions: 1,
          deletions: 0,
          diffStat: "+1",
          diffSummary: null,
          firstSeenRun: 1,
        },
      ])
    );

    mockGetTicketsByKeys.mockImplementation(() =>
      Promise.resolve([
        {
          id: 1,
          jiraKey: "PI-456",
          summary: "Login page broken",
          status: "In Progress",
          assignee: "Alice",
          priority: "High",
          ticketType: "Bug",
          parentKey: null,
          labels: null,
          description: null,
          subtasks: null,
          commentsJson: null,
          dataJson: null,
          lastFetched: "2026-02-15T10:00:00Z",
        },
      ])
    );

    // Act
    const result = await generateReport(baseInput);

    // Assert
    expect(result.markdown).toContain("Ticket Index");
    expect(result.markdown).toContain("PI-456");
    expect(result.markdown).toContain("Login page broken");
  });

  it("calls all DB query functions with run ID", async () => {
    // Act
    await generateReport(baseInput);

    // Assert
    expect(mockGetTicketSummaries).toHaveBeenCalledWith(1);
    expect(mockGetCommitsForRun).toHaveBeenCalledWith(1);
    expect(mockGetRunById).toHaveBeenCalledWith(1);
  });

  it("shows orphan ticket summaries under 'Other Activity' section", async () => {
    // Arrange
    mockGetTicketSummaries.mockImplementation(() =>
      Promise.resolve([
        {
          id: 2,
          runId: 1,
          jiraKey: "branch:hotfix/urgent",
          repo: "my-repo",
          summaryText: "Quick hotfix for production issue",
          authorEmails: "bob@dev.com",
          branchNames: '["hotfix/urgent"]',
          claudeSessionId: null,
          createdAt: "2026-02-15T10:00:00Z",
        },
      ])
    );

    // Act
    const result = await generateReport(baseInput);

    // Assert
    expect(result.markdown).toContain("Other Activity");
    expect(result.markdown).toContain("hotfix/urgent");
    expect(result.markdown).toContain("Quick hotfix");
  });
});
