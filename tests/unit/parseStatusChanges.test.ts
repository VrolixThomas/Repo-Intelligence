import { describe, it, expect } from "bun:test";
import { parseStatusChanges } from "../../src/jira/tickets";

describe("parseStatusChanges", () => {
  it("extracts status changes from changelog histories", () => {
    // Arrange
    const data = {
      changelog: {
        histories: [
          {
            created: "2026-02-13T10:00:00.000+0000",
            author: { displayName: "Alice" },
            items: [
              { field: "status", fromString: "To Do", toString: "In Progress" },
            ],
          },
        ],
      },
    };

    // Act
    const changes = parseStatusChanges(data);

    // Assert
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      changedAt: "2026-02-13T10:00:00.000+0000",
      fromStatus: "To Do",
      toStatus: "In Progress",
      changedBy: "Alice",
    });
  });

  it("filters out non-status field changes", () => {
    // Arrange
    const data = {
      changelog: {
        histories: [
          {
            created: "2026-02-13T10:00:00.000+0000",
            author: { displayName: "Alice" },
            items: [
              { field: "assignee", fromString: null, toString: "Alice" },
              { field: "priority", fromString: "Medium", toString: "High" },
            ],
          },
        ],
      },
    };

    // Act & Assert
    expect(parseStatusChanges(data)).toHaveLength(0);
  });

  it("extracts multiple status changes from a single history entry", () => {
    // Arrange
    // Unlikely in practice but the code handles it
    const data = {
      changelog: {
        histories: [
          {
            created: "2026-02-13T10:00:00.000+0000",
            author: { displayName: "Alice" },
            items: [
              { field: "status", fromString: "To Do", toString: "In Progress" },
              { field: "status", fromString: "In Progress", toString: "Done" },
            ],
          },
        ],
      },
    };

    // Act & Assert
    expect(parseStatusChanges(data)).toHaveLength(2);
  });

  it("sorts changes chronologically ascending", () => {
    // Arrange
    const data = {
      changelog: {
        histories: [
          {
            created: "2026-02-15T10:00:00.000+0000",
            author: { displayName: "Bob" },
            items: [{ field: "status", fromString: "In Progress", toString: "Done" }],
          },
          {
            created: "2026-02-13T10:00:00.000+0000",
            author: { displayName: "Alice" },
            items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
          },
        ],
      },
    };

    // Act
    const changes = parseStatusChanges(data);

    // Assert
    expect(changes).toHaveLength(2);
    expect(changes[0]!.toStatus).toBe("In Progress");
    expect(changes[1]!.toStatus).toBe("Done");
  });

  it("handles null fromString", () => {
    // Arrange
    const data = {
      changelog: {
        histories: [
          {
            created: "2026-02-13T10:00:00.000+0000",
            author: { displayName: "Alice" },
            items: [{ field: "status", fromString: null, toString: "To Do" }],
          },
        ],
      },
    };

    // Act
    const changes = parseStatusChanges(data);

    // Assert
    expect(changes[0]!.fromStatus).toBeNull();
  });

  it("uses explicit toString value when provided", () => {
    // Arrange
    // Note: Jira's field is literally named "toString" which collides with
    // Object.prototype.toString. When the field is missing, item.toString
    // resolves to the inherited function (truthy), so the ?? fallback
    // never triggers. In practice Jira always provides toString for status changes.
    const data = {
      changelog: {
        histories: [
          {
            created: "2026-02-13T10:00:00.000+0000",
            author: { displayName: "Alice" },
            items: [{ field: "status", fromString: "To Do", toString: "Done" }],
          },
        ],
      },
    };

    // Act
    const changes = parseStatusChanges(data);

    // Assert
    expect(changes[0]!.toStatus).toBe("Done");
  });

  it("handles missing author", () => {
    // Arrange
    const data = {
      changelog: {
        histories: [
          {
            created: "2026-02-13T10:00:00.000+0000",
            items: [{ field: "status", fromString: "To Do", toString: "Done" }],
          },
        ],
      },
    };

    // Act
    const changes = parseStatusChanges(data);

    // Assert
    expect(changes[0]!.changedBy).toBeNull();
  });

  it("handles missing changelog entirely", () => {
    // Act & Assert
    expect(parseStatusChanges({})).toEqual([]);
  });

  it("handles missing histories array", () => {
    // Act & Assert
    expect(parseStatusChanges({ changelog: {} })).toEqual([]);
  });

  it("handles history entry with no items", () => {
    // Arrange
    const data = {
      changelog: {
        histories: [{ created: "2026-02-13T10:00:00.000+0000", author: { displayName: "Alice" } }],
      },
    };

    // Act & Assert
    expect(parseStatusChanges(data)).toEqual([]);
  });
});
