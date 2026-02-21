import { describe, it, expect } from "bun:test";
import { mapTicket } from "../../src/jira/tickets";
import { makeJiraIssueResponse, makeMinimalJiraIssue } from "../fixtures/jira-responses";

describe("mapTicket", () => {
  it("maps all fields from a full Jira response", () => {
    // Arrange
    const data = makeJiraIssueResponse();

    // Act
    const ticket = mapTicket("PI-456", data);

    // Assert
    expect(ticket.jiraKey).toBe("PI-456");
    expect(ticket.summary).toBe("Fix login timeout");
    expect(ticket.status).toBe("In Progress");
    expect(ticket.assignee).toBe("Alice Dev");
    expect(ticket.priority).toBe("High");
    expect(ticket.ticketType).toBe("Bug");
    expect(ticket.parentKey).toBe("PI-100");
  });

  it("extracts description from ADF to plain text", () => {
    // Arrange
    const data = makeJiraIssueResponse();

    // Act
    const ticket = mapTicket("PI-456", data);

    // Assert
    expect(ticket.description).toBe("This is a description.");
  });

  it("stores subtask keys as JSON array", () => {
    // Arrange
    const data = makeJiraIssueResponse();

    // Act
    const ticket = mapTicket("PI-456", data);

    // Assert
    expect(JSON.parse(ticket.subtasks!)).toEqual(["PI-457", "PI-458"]);
  });

  it("stores labels as JSON array", () => {
    // Arrange
    const data = makeJiraIssueResponse();

    // Act
    const ticket = mapTicket("PI-456", data);

    // Assert
    expect(JSON.parse(ticket.labels!)).toEqual(["backend", "auth"]);
  });

  it("extracts the last 5 comments as JSON", () => {
    // Arrange
    const data = makeJiraIssueResponse();

    // Act
    const ticket = mapTicket("PI-456", data);

    // Assert
    const comments = JSON.parse(ticket.commentsJson!);
    expect(comments).toHaveLength(2);
    expect(comments[0].author).toBe("Bob QA");
    expect(comments[0].body).toContain("Confirmed the bug.");
    expect(comments[1].author).toBe("Alice Dev");
  });

  it("extracts status changes from changelog", () => {
    // Arrange
    const data = makeJiraIssueResponse();

    // Act
    const ticket = mapTicket("PI-456", data);

    // Assert
    expect(ticket.statusChanges).toHaveLength(2);
    expect(ticket.statusChanges[0]!.fromStatus).toBe("To Do");
    expect(ticket.statusChanges[0]!.toStatus).toBe("In Progress");
    expect(ticket.statusChanges[1]!.toStatus).toBe("In Review");
  });

  it("preserves lastJiraUpdated", () => {
    // Arrange
    const data = makeJiraIssueResponse();

    // Act
    const ticket = mapTicket("PI-456", data);

    // Assert
    expect(ticket.lastJiraUpdated).toBe("2026-02-15T12:00:00.000+0000");
  });

  it("stores raw response as dataJson", () => {
    // Arrange
    const data = makeJiraIssueResponse();

    // Act
    const ticket = mapTicket("PI-456", data);

    // Assert
    expect(ticket.dataJson).toBeTruthy();
    const parsed = JSON.parse(ticket.dataJson!);
    expect(parsed.key).toBe("PI-456");
  });

  it("handles minimal ticket with null/empty fields", () => {
    // Arrange
    const data = makeMinimalJiraIssue("PI-999");

    // Act
    const ticket = mapTicket("PI-999", data);

    // Assert
    expect(ticket.jiraKey).toBe("PI-999");
    expect(ticket.summary).toBe("Minimal ticket");
    expect(ticket.description).toBeNull();
    expect(ticket.status).toBeNull();
    expect(ticket.assignee).toBeNull();
    expect(ticket.priority).toBeNull();
    expect(ticket.ticketType).toBeNull();
    expect(ticket.parentKey).toBeNull();
    expect(ticket.subtasks).toBeNull();
    expect(ticket.labels).toBeNull();
    expect(ticket.commentsJson).toBeNull();
    expect(ticket.lastJiraUpdated).toBeNull();
    expect(ticket.statusChanges).toEqual([]);
  });

  it("limits comments to last 5", () => {
    // Arrange
    const manyComments = Array.from({ length: 8 }, (_, i) => ({
      author: { displayName: `User${i}` },
      created: `2026-02-${String(i + 1).padStart(2, "0")}T10:00:00.000+0000`,
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Comment ${i}` }] }] },
    }));

    const data = makeJiraIssueResponse({ comment: { comments: manyComments } });

    // Act
    const ticket = mapTicket("PI-456", data);

    // Assert
    const comments = JSON.parse(ticket.commentsJson!);
    expect(comments).toHaveLength(5);
    expect(comments[0].author).toBe("User3"); // slice(-5) gives indices 3-7
    expect(comments[4].author).toBe("User7");
  });
});
