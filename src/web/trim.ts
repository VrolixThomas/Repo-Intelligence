/**
 * Response trimming helpers for web API endpoints.
 * Extracted for testability — the main web.ts imports from here.
 */

/**
 * Strip heavy fields from a ticket for lightweight API responses.
 * Keeps only the fields needed for the lifecycle/kanban views.
 */
export function trimTicketLite(t: any) {
  return {
    id: t.id,
    jiraKey: t.jiraKey,
    summary: t.summary,
    status: t.status,
    assignee: t.assignee,
    priority: t.priority,
    ticketType: t.ticketType,
    parentKey: t.parentKey,
    labels: t.labels,
  };
}
