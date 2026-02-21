import { describe, it, expect } from "bun:test";
import { trimTicketLite } from "../../src/web/trim";

describe("trimTicketLite", () => {
  const fullTicket = {
    id: 42,
    jiraKey: "PI-123",
    summary: "Fix login bug",
    status: "In Progress",
    assignee: "Alice",
    priority: "High",
    ticketType: "Bug",
    parentKey: "PI-100",
    labels: "backend,urgent",
    // Heavy fields that should be stripped
    description: "A very long description...",
    commentsJson: '[{"body":"looks good"}]',
    dataJson: '{"changelog":{}}',
    subtasks: "[PI-124, PI-125]",
    lastFetched: "2026-02-15T10:00:00Z",
    diffSummary: "500 lines changed",
    extraField: "should be dropped",
  };

  it("includes all expected fields", () => {
    // Act
    const trimmed = trimTicketLite(fullTicket);

    // Assert
    expect(trimmed).toEqual({
      id: 42,
      jiraKey: "PI-123",
      summary: "Fix login bug",
      status: "In Progress",
      assignee: "Alice",
      priority: "High",
      ticketType: "Bug",
      parentKey: "PI-100",
      labels: "backend,urgent",
    });
  });

  it("strips description", () => {
    // Act
    const trimmed = trimTicketLite(fullTicket);

    // Assert
    expect(trimmed).not.toHaveProperty("description");
  });

  it("strips commentsJson", () => {
    // Act
    const trimmed = trimTicketLite(fullTicket);

    // Assert
    expect(trimmed).not.toHaveProperty("commentsJson");
  });

  it("strips dataJson", () => {
    // Act
    const trimmed = trimTicketLite(fullTicket);

    // Assert
    expect(trimmed).not.toHaveProperty("dataJson");
  });

  it("strips subtasks", () => {
    // Act
    const trimmed = trimTicketLite(fullTicket);

    // Assert
    expect(trimmed).not.toHaveProperty("subtasks");
  });

  it("strips lastFetched", () => {
    // Act
    const trimmed = trimTicketLite(fullTicket);

    // Assert
    expect(trimmed).not.toHaveProperty("lastFetched");
  });

  it("strips unknown/extra fields", () => {
    // Act
    const trimmed = trimTicketLite(fullTicket);

    // Assert
    expect(trimmed).not.toHaveProperty("extraField");
    expect(trimmed).not.toHaveProperty("diffSummary");
  });

  it("handles missing optional fields gracefully", () => {
    // Arrange
    const minimal = { id: 1, jiraKey: "X-1", summary: "test", status: "Open" };

    // Act
    const trimmed = trimTicketLite(minimal);

    // Assert
    expect(trimmed.id).toBe(1);
    expect(trimmed.jiraKey).toBe("X-1");
    expect(trimmed.assignee).toBeUndefined();
    expect(trimmed.labels).toBeUndefined();
  });

  it("handles null values for fields", () => {
    // Arrange
    const ticket = { ...fullTicket, assignee: null, parentKey: null };

    // Act
    const trimmed = trimTicketLite(ticket);

    // Assert
    expect(trimmed.assignee).toBeNull();
    expect(trimmed.parentKey).toBeNull();
  });
});
