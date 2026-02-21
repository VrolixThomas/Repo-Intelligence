import { describe, it, expect } from "bun:test";
import { extractJiraKeys } from "../../src/git/scanner";

describe("extractJiraKeys", () => {
  it("extracts a single key from a commit message", () => {
    // Act & Assert
    expect(extractJiraKeys("fix: resolve PI-1234 login bug")).toEqual(["PI-1234"]);
  });

  it("extracts multiple distinct keys", () => {
    // Act & Assert
    expect(extractJiraKeys("PI-123 and INFRA-456 work")).toEqual(["PI-123", "INFRA-456"]);
  });

  it("deduplicates repeated keys", () => {
    // Act & Assert
    expect(extractJiraKeys("PI-123 relates to PI-123")).toEqual(["PI-123"]);
  });

  it("rejects KEY-0 (zero-only ticket numbers)", () => {
    // Act & Assert
    expect(extractJiraKeys("PI-0 PI-00 PI-000")).toEqual([]);
  });

  it("accepts KEY-10, KEY-100 (trailing zeros are fine)", () => {
    // Act & Assert
    expect(extractJiraKeys("PI-10 PI-100")).toEqual(["PI-10", "PI-100"]);
  });

  it("extracts keys from branch names", () => {
    // Act & Assert
    expect(extractJiraKeys("feature/PI-789-user-settings")).toEqual(["PI-789"]);
  });

  it("extracts keys from combined message + branch text", () => {
    // Arrange
    const text = "fix login PI-111" + " " + "feature/PI-222-auth";

    // Act & Assert
    expect(extractJiraKeys(text)).toEqual(["PI-111", "PI-222"]);
  });

  it("handles multi-character project prefixes", () => {
    // Act & Assert
    expect(extractJiraKeys("PROJ-42 AB-1 XYZ2-99")).toEqual(["PROJ-42", "AB-1", "XYZ2-99"]);
  });

  it("returns empty array for no matches", () => {
    // Act & Assert
    expect(extractJiraKeys("refactor: cleanup code")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    // Act & Assert
    expect(extractJiraKeys("")).toEqual([]);
  });

  it("does not match lowercase project keys", () => {
    // Act & Assert
    expect(extractJiraKeys("pi-123 proj-456")).toEqual([]);
  });

  it("ignores leading digit prefix and matches the valid key portion", () => {
    // "1ABC-123" — the regex skips the leading "1" and matches "ABC-123"
    // Act & Assert
    expect(extractJiraKeys("1ABC-123")).toEqual(["ABC-123"]);
  });

  it("handles keys at start and end of string", () => {
    // Act & Assert
    expect(extractJiraKeys("PI-1 some text PI-2")).toEqual(["PI-1", "PI-2"]);
  });

  it("extracts keys separated by commas or other punctuation", () => {
    // Act & Assert
    expect(extractJiraKeys("PI-123,INFRA-456")).toEqual(["PI-123", "INFRA-456"]);
    expect(extractJiraKeys("[PI-123]")).toEqual(["PI-123"]);
    expect(extractJiraKeys("(PI-123)")).toEqual(["PI-123"]);
  });

  it("extracts key from URL-like strings", () => {
    // Act & Assert
    expect(extractJiraKeys("https://jira.example.com/browse/PI-123")).toEqual(["PI-123"]);
  });

  it("handles multi-hyphen strings — matches first valid key segment", () => {
    // "MY-PROJ-100" — regex matches "PROJ-100" (MY-P doesn't match because MY- is followed by P not digit)
    // Arrange
    const result = extractJiraKeys("MY-PROJ-100");

    // Assert
    expect(result).toEqual(["PROJ-100"]);
  });
});
