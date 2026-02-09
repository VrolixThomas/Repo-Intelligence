/**
 * Jira REST API HTTP client.
 * Uses Basic Auth with JIRA_EMAIL + JIRA_API_TOKEN from env (Bun auto-loads .env).
 */

export interface JiraClientConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export function getJiraConfig(baseUrl: string): JiraClientConfig | null {
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!email || !apiToken) {
    return null;
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), email, apiToken };
}

export async function jiraFetch(config: JiraClientConfig, path: string): Promise<{ ok: true; data: any } | { ok: false; status: number; message: string }> {
  const url = `${config.baseUrl}${path}`;
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, status: response.status, message: text };
  }

  const data = await response.json();
  return { ok: true, data };
}
