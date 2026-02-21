import { describe, it, expect } from "bun:test";
import { parseActivityEntry } from "../../src/bitbucket/pr-activity";

describe("parseActivityEntry", () => {
  it("parses an approval event", () => {
    // Arrange
    const entry = {
      approval: {
        user: { display_name: "Alice" },
        date: "2026-02-15T10:00:00Z",
      },
    };

    // Act
    const result = parseActivityEntry(entry);

    // Assert
    expect(result).toEqual({
      activityType: "approval",
      actorName: "Alice",
      timestamp: "2026-02-15T10:00:00Z",
      newState: null,
      commentText: null,
      commitHash: null,
    });
  });

  it("parses a comment event", () => {
    // Arrange
    const entry = {
      comment: {
        user: { display_name: "Bob" },
        created_on: "2026-02-15T11:00:00Z",
        content: { raw: "Looks good to me!" },
      },
    };

    // Act
    const result = parseActivityEntry(entry);

    // Assert
    expect(result).toEqual({
      activityType: "comment",
      actorName: "Bob",
      timestamp: "2026-02-15T11:00:00Z",
      newState: null,
      commentText: "Looks good to me!",
      commitHash: null,
    });
  });

  it("truncates long comments to 500 chars", () => {
    // Arrange
    const longText = "x".repeat(1000);
    const entry = {
      comment: {
        user: { display_name: "Bob" },
        created_on: "2026-02-15T11:00:00Z",
        content: { raw: longText },
      },
    };

    // Act
    const result = parseActivityEntry(entry)!;

    // Assert
    expect(result.commentText).toHaveLength(500);
  });

  it("parses a regular update event (new commits pushed)", () => {
    // Arrange
    const entry = {
      update: {
        author: { display_name: "Charlie" },
        date: "2026-02-15T12:00:00Z",
        state: "OPEN",
        source: { commit: { hash: "abc123" } },
      },
    };

    // Act
    const result = parseActivityEntry(entry);

    // Assert
    expect(result).toEqual({
      activityType: "update",
      actorName: "Charlie",
      timestamp: "2026-02-15T12:00:00Z",
      newState: "OPEN",
      commentText: null,
      commitHash: "abc123",
    });
  });

  it("detects changes_requested via changes.status.new", () => {
    // Arrange
    const entry = {
      update: {
        author: { display_name: "Reviewer" },
        date: "2026-02-15T13:00:00Z",
        changes: { status: { new: "changes_requested" } },
      },
    };

    // Act
    const result = parseActivityEntry(entry);

    // Assert
    expect(result!.activityType).toBe("request_changes");
    expect(result!.newState).toBe("changes_requested");
  });

  it("detects changes_requested via update.state", () => {
    // Arrange
    const entry = {
      update: {
        author: { display_name: "Reviewer" },
        date: "2026-02-15T13:00:00Z",
        state: "changes_requested",
      },
    };

    // Act
    const result = parseActivityEntry(entry);

    // Assert
    expect(result!.activityType).toBe("request_changes");
  });

  it("returns null for unrecognized entry types", () => {
    // Act & Assert
    expect(parseActivityEntry({})).toBeNull();
    expect(parseActivityEntry({ unknown: true })).toBeNull();
  });

  it("handles missing user in approval", () => {
    // Arrange
    const entry = {
      approval: { date: "2026-02-15T10:00:00Z" },
    };

    // Act
    const result = parseActivityEntry(entry)!;

    // Assert
    expect(result.actorName).toBeNull();
  });

  it("handles missing user in comment", () => {
    // Arrange
    const entry = {
      comment: {
        created_on: "2026-02-15T11:00:00Z",
        content: { raw: "text" },
      },
    };

    // Act
    const result = parseActivityEntry(entry)!;

    // Assert
    expect(result.actorName).toBeNull();
  });

  it("handles missing content in comment", () => {
    // Arrange
    const entry = {
      comment: {
        user: { display_name: "Bob" },
        created_on: "2026-02-15T11:00:00Z",
      },
    };

    // Act
    const result = parseActivityEntry(entry)!;

    // Assert
    expect(result.commentText).toBe("");
  });

  it("handles missing source commit in update", () => {
    // Arrange
    const entry = {
      update: {
        author: { display_name: "Charlie" },
        date: "2026-02-15T12:00:00Z",
        state: "OPEN",
      },
    };

    // Act
    const result = parseActivityEntry(entry)!;

    // Assert
    expect(result.commitHash).toBeNull();
  });

  it("handles empty approval date", () => {
    // Arrange
    const entry = { approval: { user: { display_name: "X" } } };

    // Act
    const result = parseActivityEntry(entry)!;

    // Assert
    expect(result.timestamp).toBe("");
  });
});
