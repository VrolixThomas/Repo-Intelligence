/**
 * Jira ticket fetching and response mapping.
 */

import { jiraFetch, type JiraClientConfig } from "./client";

export interface StatusChange {
  changedAt: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string | null;
}

export interface TicketData {
  jiraKey: string;
  summary: string | null;
  description: string | null;
  status: string | null;
  assignee: string | null;
  priority: string | null;
  ticketType: string | null;
  parentKey: string | null;
  subtasks: string | null;
  labels: string | null;
  commentsJson: string | null;
  lastJiraUpdated: string | null;
  dataJson: string | null;
  statusChanges: StatusChange[];
}

const FIELDS = "summary,status,assignee,priority,issuetype,parent,subtasks,labels,comment,description,updated";

/**
 * Recursively extract plain text from Jira's Atlassian Document Format (ADF).
 */
export function extractAdfText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text ?? "";

  let text = "";
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      text += extractAdfText(child);
    }
    // Add newline after block-level nodes
    if (node.type === "paragraph" || node.type === "heading" || node.type === "bulletList" || node.type === "orderedList" || node.type === "listItem") {
      text += "\n";
    }
  }
  return text;
}

function parseStatusChanges(data: any): StatusChange[] {
  const histories = data.changelog?.histories ?? [];
  const changes: StatusChange[] = [];

  for (const history of histories) {
    const items = history.items ?? [];
    for (const item of items) {
      if (item.field === "status") {
        changes.push({
          changedAt: history.created,
          fromStatus: item.fromString ?? null,
          toStatus: item.toString ?? "Unknown",
          changedBy: history.author?.displayName ?? null,
        });
      }
    }
  }

  // Sort by changedAt ascending
  changes.sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  return changes;
}

function mapTicket(jiraKey: string, data: any): TicketData {
  const fields = data.fields;

  // Extract last 5 comments
  const rawComments = fields.comment?.comments ?? [];
  const lastComments = rawComments.slice(-5).map((c: any) => ({
    author: c.author?.displayName ?? "Unknown",
    date: c.created,
    body: extractAdfText(c.body),
  }));

  return {
    jiraKey,
    summary: fields.summary ?? null,
    description: extractAdfText(fields.description).trim() || null,
    status: fields.status?.name ?? null,
    assignee: fields.assignee?.displayName ?? null,
    priority: fields.priority?.name ?? null,
    ticketType: fields.issuetype?.name ?? null,
    parentKey: fields.parent?.key ?? null,
    subtasks: fields.subtasks?.length > 0 ? JSON.stringify(fields.subtasks.map((s: any) => s.key)) : null,
    labels: fields.labels?.length > 0 ? JSON.stringify(fields.labels) : null,
    commentsJson: lastComments.length > 0 ? JSON.stringify(lastComments) : null,
    lastJiraUpdated: fields.updated ?? null,
    dataJson: JSON.stringify(data),
    statusChanges: parseStatusChanges(data),
  };
}

export async function fetchTicket(config: JiraClientConfig, jiraKey: string): Promise<{ ok: true; ticket: TicketData } | { ok: false; status: number; message: string }> {
  const result = await jiraFetch(config, `/rest/api/3/issue/${jiraKey}?fields=${FIELDS}&expand=changelog`);

  if (!result.ok) {
    return result;
  }

  return { ok: true, ticket: mapTicket(jiraKey, result.data) };
}

/**
 * Filter keys to only allowed Jira projects.
 * Safety measure: only access projects we're authorized for.
 */
export function filterAllowedKeys(jiraKeys: string[], allowedProjects: string[]): { allowed: string[]; skipped: string[] } {
  const projectSet = new Set(allowedProjects.map((p) => p.toUpperCase()));
  const allowed: string[] = [];
  const skipped: string[] = [];

  for (const key of jiraKeys) {
    const project = key.split("-")[0]?.toUpperCase();
    if (project && projectSet.has(project)) {
      allowed.push(key);
    } else {
      skipped.push(key);
    }
  }

  return { allowed, skipped };
}

export async function fetchTickets(
  config: JiraClientConfig,
  jiraKeys: string[]
): Promise<{ tickets: TicketData[]; errors: { key: string; status: number; message: string }[] }> {
  const tickets: TicketData[] = [];
  const errors: { key: string; status: number; message: string }[] = [];

  // Sequential fetching to respect rate limits
  for (const key of jiraKeys) {
    const result = await fetchTicket(config, key);

    if (result.ok) {
      tickets.push(result.ticket);
    } else if (result.status === 404) {
      // Skip deleted/not-found tickets silently
      continue;
    } else {
      errors.push({ key, status: result.status, message: result.message });
    }
  }

  return { tickets, errors };
}
