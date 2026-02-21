import { describe, it, expect } from "bun:test";
import { extractAdfText } from "../../src/jira/tickets";
import { simpleAdfDoc, nestedAdfDoc } from "../fixtures/jira-responses";

describe("extractAdfText", () => {
  it("returns empty string for null input", () => {
    // Act & Assert
    expect(extractAdfText(null)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    // Act & Assert
    expect(extractAdfText(undefined)).toBe("");
  });

  it("returns string input as-is", () => {
    // Act & Assert
    expect(extractAdfText("plain text")).toBe("plain text");
  });

  it("extracts text from a simple paragraph", () => {
    // Act
    const result = extractAdfText(simpleAdfDoc);

    // Assert
    expect(result).toContain("This is a description.");
  });

  it("extracts text from a text node", () => {
    // Arrange
    const node = { type: "text", text: "Hello world" };

    // Act & Assert
    expect(extractAdfText(node)).toBe("Hello world");
  });

  it("handles text node with missing text property", () => {
    // Arrange
    const node = { type: "text" };

    // Act & Assert
    expect(extractAdfText(node)).toBe("");
  });

  it("adds newlines after block-level nodes", () => {
    // Act
    const result = extractAdfText(nestedAdfDoc);

    // Assert
    // Heading, paragraph, list items all get trailing newlines
    expect(result).toContain("Summary\n");
    expect(result).toContain("First part and second part.\n");
  });

  it("handles nested bullet list", () => {
    // Act
    const result = extractAdfText(nestedAdfDoc);

    // Assert
    expect(result).toContain("Item one");
    expect(result).toContain("Item two");
  });

  it("handles deeply nested content", () => {
    // Arrange
    const deep = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "deep" }],
            },
          ],
        },
      ],
    };

    // Act & Assert
    expect(extractAdfText(deep)).toContain("deep");
  });

  it("handles node with empty content array", () => {
    // Arrange
    const node = { type: "paragraph", content: [] };

    // Act & Assert
    expect(extractAdfText(node)).toBe("\n");
  });

  it("handles node with no content property", () => {
    // Arrange
    const node = { type: "unknown_node" };

    // Act & Assert
    expect(extractAdfText(node)).toBe("");
  });
});
