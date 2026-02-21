import { describe, it, expect } from "bun:test";
import { parseComment } from "../../src/bitbucket/comments";

describe("parseComment", () => {
  it("parses a regular comment", () => {
    // Arrange
    const raw = {
      id: 101,
      user: { display_name: "Alice" },
      content: { raw: "Looks good to me!" },
      created_on: "2026-02-15T10:00:00Z",
      inline: null,
      parent: null,
    };

    // Act
    const result = parseComment(raw);

    // Assert
    expect(result).toEqual({
      commentId: 101,
      authorName: "Alice",
      content: "Looks good to me!",
      createdAt: "2026-02-15T10:00:00Z",
      isInline: false,
      filePath: null,
      lineTo: null,
      parentId: null,
    });
  });

  it("parses an inline comment with file path and line", () => {
    // Arrange
    const raw = {
      id: 202,
      user: { display_name: "Bob" },
      content: { raw: "This should use a constant." },
      created_on: "2026-02-15T11:00:00Z",
      inline: { path: "src/utils.ts", to: 42 },
    };

    // Act
    const result = parseComment(raw)!;

    // Assert
    expect(result.isInline).toBe(true);
    expect(result.filePath).toBe("src/utils.ts");
    expect(result.lineTo).toBe(42);
  });

  it("returns null for empty content", () => {
    // Arrange
    const raw = {
      id: 303,
      user: { display_name: "Charlie" },
      content: { raw: "" },
      created_on: "2026-02-15T12:00:00Z",
    };

    // Act & Assert
    expect(parseComment(raw)).toBeNull();
  });

  it("returns null for whitespace-only content", () => {
    // Arrange
    const raw = {
      id: 404,
      user: { display_name: "Dave" },
      content: { raw: "   \n\t  " },
      created_on: "2026-02-15T12:00:00Z",
    };

    // Act & Assert
    expect(parseComment(raw)).toBeNull();
  });

  it("handles missing user (defaults to Unknown)", () => {
    // Arrange
    const raw = {
      id: 505,
      content: { raw: "some feedback" },
      created_on: "2026-02-15T13:00:00Z",
    };

    // Act
    const result = parseComment(raw)!;

    // Assert
    expect(result.authorName).toBe("Unknown");
  });

  it("handles missing content object", () => {
    // Arrange
    const raw = {
      id: 606,
      user: { display_name: "Eve" },
      created_on: "2026-02-15T14:00:00Z",
    };

    // Act & Assert
    // content?.raw → undefined → empty string → .trim() → "" → returns null
    expect(parseComment(raw)).toBeNull();
  });

  it("handles threaded reply (parentId)", () => {
    // Arrange
    const raw = {
      id: 707,
      user: { display_name: "Frank" },
      content: { raw: "Agreed." },
      created_on: "2026-02-15T15:00:00Z",
      parent: { id: 101 },
    };

    // Act
    const result = parseComment(raw)!;

    // Assert
    expect(result.parentId).toBe(101);
  });

  it("handles missing id (defaults to 0)", () => {
    // Arrange
    const raw = {
      user: { display_name: "Grace" },
      content: { raw: "LGTM" },
      created_on: "2026-02-15T16:00:00Z",
    };

    // Act
    const result = parseComment(raw)!;

    // Assert
    expect(result.commentId).toBe(0);
  });

  it("handles missing created_on (defaults to empty string)", () => {
    // Arrange
    const raw = {
      id: 808,
      user: { display_name: "Hank" },
      content: { raw: "Needs work" },
    };

    // Act
    const result = parseComment(raw)!;

    // Assert
    expect(result.createdAt).toBe("");
  });

  it("handles inline without path or line", () => {
    // Arrange
    const raw = {
      id: 909,
      user: { display_name: "Ivy" },
      content: { raw: "Note here" },
      created_on: "2026-02-15T17:00:00Z",
      inline: {},
    };

    // Act
    const result = parseComment(raw)!;

    // Assert
    expect(result.isInline).toBe(true);
    expect(result.filePath).toBeNull();
    expect(result.lineTo).toBeNull();
  });
});
