/**
 * Shared test fixtures for Jira API responses.
 */

/** Minimal ADF document with paragraph text */
export const simpleAdfDoc = {
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "This is a description." }],
    },
  ],
};

/** ADF document with nested structure */
export const nestedAdfDoc = {
  type: "doc",
  version: 1,
  content: [
    {
      type: "heading",
      content: [{ type: "text", text: "Summary" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "First part " },
        { type: "text", text: "and second part." },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Item one" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Item two" }],
            },
          ],
        },
      ],
    },
  ],
};

/** Raw Jira issue response (as returned by /rest/api/3/issue) */
export function makeJiraIssueResponse(overrides: Record<string, any> = {}) {
  return {
    key: "PI-456",
    fields: {
      summary: "Fix login timeout",
      description: simpleAdfDoc,
      status: { name: "In Progress" },
      assignee: { displayName: "Alice Dev" },
      priority: { name: "High" },
      issuetype: { name: "Bug" },
      parent: { key: "PI-100" },
      subtasks: [{ key: "PI-457" }, { key: "PI-458" }],
      labels: ["backend", "auth"],
      updated: "2026-02-15T12:00:00.000+0000",
      comment: {
        comments: [
          {
            author: { displayName: "Bob QA" },
            created: "2026-02-14T09:00:00.000+0000",
            body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Confirmed the bug." }] }] },
          },
          {
            author: { displayName: "Alice Dev" },
            created: "2026-02-14T15:00:00.000+0000",
            body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Working on a fix." }] }] },
          },
        ],
      },
      ...overrides,
    },
    changelog: {
      histories: [
        {
          created: "2026-02-13T10:00:00.000+0000",
          author: { displayName: "Alice Dev" },
          items: [
            { field: "status", fromString: "To Do", toString: "In Progress" },
            { field: "assignee", fromString: null, toString: "Alice Dev" },
          ],
        },
        {
          created: "2026-02-14T16:00:00.000+0000",
          author: { displayName: "Alice Dev" },
          items: [
            { field: "status", fromString: "In Progress", toString: "In Review" },
          ],
        },
      ],
    },
  };
}

/** Jira response with no comments, no changelog, minimal fields */
export function makeMinimalJiraIssue(key: string = "PI-999") {
  return {
    key,
    fields: {
      summary: "Minimal ticket",
      description: null,
      status: null,
      assignee: null,
      priority: null,
      issuetype: null,
      parent: null,
      subtasks: [],
      labels: [],
      updated: null,
      comment: { comments: [] },
    },
    changelog: { histories: [] },
  };
}
