/**
 * Jira Agile API — Sprint sync.
 * Uses /rest/agile/1.0/ endpoints for board, sprint, and issue data.
 */

import { jiraFetch, type JiraClientConfig } from "./client";

export interface SprintData {
  jiraSprintId: number;
  boardId: number;
  name: string;
  state: "active" | "closed" | "future";
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
}

/**
 * Find the scrum board ID for a given project key.
 */
export async function fetchBoardId(config: JiraClientConfig, projectKey: string): Promise<number | null> {
  const result = await jiraFetch(config, `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum`);

  if (!result.ok) {
    console.log(`  Jira Agile: board lookup failed (${result.status})`);
    return null;
  }

  const values = result.data.values as any[];
  if (!values || values.length === 0) {
    return null;
  }

  return values[0].id;
}

/**
 * Fetch the most recent sprints for a board (active, closed, future).
 * The Agile API returns sprints oldest-first with no desc option,
 * so we first get the total count, then fetch the last N.
 */
export async function fetchSprints(config: JiraClientConfig, boardId: number, count = 10): Promise<SprintData[]> {
  // First call: get total count (fetch 1 result just to read total)
  const probe = await jiraFetch(
    config,
    `/rest/agile/1.0/board/${boardId}/sprint?state=active,closed,future&maxResults=1`
  );

  if (!probe.ok) {
    console.log(`  Jira Agile: sprint list failed (${probe.status})`);
    return [];
  }

  const total = probe.data.total ?? 0;
  if (total === 0) return [];

  // Fetch the last N sprints
  const startAt = Math.max(0, total - count);
  const result = await jiraFetch(
    config,
    `/rest/agile/1.0/board/${boardId}/sprint?state=active,closed,future&maxResults=${count}&startAt=${startAt}`
  );

  if (!result.ok) {
    console.log(`  Jira Agile: sprint list failed (${result.status})`);
    return [];
  }

  const values = result.data.values as any[];
  if (!values) return [];

  return values.map((s: any) => ({
    jiraSprintId: s.id,
    boardId,
    name: s.name ?? `Sprint ${s.id}`,
    state: s.state ?? "closed",
    startDate: s.startDate ?? null,
    endDate: s.endDate ?? null,
    goal: s.goal ?? null,
  }));
}

/**
 * Fetch all issue keys for a sprint (paginated).
 */
export async function fetchSprintIssueKeys(config: JiraClientConfig, sprintId: number): Promise<string[]> {
  const keys: string[] = [];
  let startAt = 0;
  const maxResults = 200;

  while (true) {
    const result = await jiraFetch(
      config,
      `/rest/agile/1.0/sprint/${sprintId}/issue?fields=key&maxResults=${maxResults}&startAt=${startAt}`
    );

    if (!result.ok) {
      console.log(`  Jira Agile: sprint issues failed (${result.status})`);
      break;
    }

    const issues = result.data.issues as any[];
    if (!issues || issues.length === 0) break;

    for (const issue of issues) {
      if (issue.key) keys.push(issue.key);
    }

    // Check if there are more pages
    const total = result.data.total ?? 0;
    startAt += issues.length;
    if (startAt >= total) break;
  }

  return keys;
}
