import { describe, it, expect } from "bun:test";
import { filterAllowedKeys } from "../../src/jira/tickets";

describe("filterAllowedKeys", () => {
  // Arrange
  const allowedProjects = ["PI", "INFRA"];

  it("allows keys from configured projects", () => {
    // Act
    const result = filterAllowedKeys(["PI-123", "INFRA-456"], allowedProjects);

    // Assert
    expect(result.allowed).toEqual(["PI-123", "INFRA-456"]);
    expect(result.skipped).toEqual([]);
  });

  it("skips keys from non-allowed projects", () => {
    // Act
    const result = filterAllowedKeys(["PI-1", "OTHER-99", "HACK-5"], allowedProjects);

    // Assert
    expect(result.allowed).toEqual(["PI-1"]);
    expect(result.skipped).toEqual(["OTHER-99", "HACK-5"]);
  });

  it("is case-insensitive on project comparison", () => {
    // Act
    const result = filterAllowedKeys(["pi-100", "Pi-200"], ["PI"]);

    // Assert
    // The key itself is compared by extracting prefix and uppercasing
    expect(result.allowed).toEqual(["pi-100", "Pi-200"]);
  });

  it("handles empty input arrays", () => {
    // Act
    const result = filterAllowedKeys([], allowedProjects);

    // Assert
    expect(result.allowed).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("handles empty allowed projects — skips everything", () => {
    // Act
    const result = filterAllowedKeys(["PI-1", "INFRA-2"], []);

    // Assert
    expect(result.allowed).toEqual([]);
    expect(result.skipped).toEqual(["PI-1", "INFRA-2"]);
  });

  it("handles malformed keys without a dash", () => {
    // Act
    const result = filterAllowedKeys(["NODASH", "PI-1"], allowedProjects);

    // Assert
    expect(result.allowed).toEqual(["PI-1"]);
    expect(result.skipped).toEqual(["NODASH"]);
  });
});
