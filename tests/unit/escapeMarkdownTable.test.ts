import { describe, it, expect } from "bun:test";
import { escapeMarkdownTable } from "../../src/report/generate";

describe("escapeMarkdownTable", () => {
  it("escapes pipe characters", () => {
    // Act & Assert
    expect(escapeMarkdownTable("a|b|c")).toBe("a\\|b\\|c");
  });

  it("replaces newlines with spaces", () => {
    // Act & Assert
    expect(escapeMarkdownTable("line1\nline2\nline3")).toBe("line1 line2 line3");
  });

  it("handles both pipes and newlines", () => {
    // Act & Assert
    expect(escapeMarkdownTable("a|b\nc|d")).toBe("a\\|b c\\|d");
  });

  it("returns unchanged string when no special chars", () => {
    // Act & Assert
    expect(escapeMarkdownTable("plain text")).toBe("plain text");
  });

  it("handles empty string", () => {
    // Act & Assert
    expect(escapeMarkdownTable("")).toBe("");
  });

  it("handles multiple consecutive pipes", () => {
    // Act & Assert
    expect(escapeMarkdownTable("||")).toBe("\\|\\|");
  });
});
