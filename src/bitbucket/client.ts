/**
 * Bitbucket REST API HTTP client.
 * Auth: email + token via Basic Auth.
 * Resolves email from BITBUCKET_EMAIL or JIRA_EMAIL,
 * token from BITBUCKET_API_TOKEN or JIRA_API_TOKEN.
 */

import type { Config } from "../config";

export interface BitbucketClientConfig {
  apiUrl: string;       // "https://api.bitbucket.org/2.0"
  browserUrl: string;   // "https://bitbucket.org"
  workspace: string;
  username: string;
  apiToken: string;
}

export function getBitbucketConfig(config: Config): BitbucketClientConfig | null {
  const bb = config.bitbucket;
  if (!bb) return null;

  // Derive API URL from base_url
  const browserUrl = bb.base_url.replace(/\/+$/, "");
  const apiUrl = browserUrl.replace("://bitbucket.org", "://api.bitbucket.org/2.0");

  // Bitbucket API tokens use Atlassian account email + token (Basic Auth).
  // Resolve email: BITBUCKET_EMAIL > JIRA_EMAIL
  // Resolve token: BITBUCKET_API_TOKEN > JIRA_API_TOKEN
  const email = process.env.BITBUCKET_EMAIL ?? process.env.JIRA_EMAIL;
  const token = process.env.BITBUCKET_API_TOKEN ?? process.env.JIRA_API_TOKEN;

  if (email && token) {
    const source = process.env.BITBUCKET_API_TOKEN ? "BITBUCKET_API_TOKEN" : "JIRA_API_TOKEN";
    console.log(`Bitbucket: authenticating as ${email} (${source})`);
    return {
      apiUrl,
      browserUrl,
      workspace: bb.workspace,
      username: email,
      apiToken: token,
    };
  }

  console.log("Bitbucket: no credentials found. Set BITBUCKET_API_TOKEN (or JIRA_EMAIL+JIRA_API_TOKEN)");
  return null;
}

export async function bitbucketFetch(
  config: BitbucketClientConfig,
  path: string
): Promise<{ ok: true; data: any } | { ok: false; status: number; message: string }> {
  const url = path.startsWith("http") ? path : `${config.apiUrl}${path}`;
  const auth = Buffer.from(`${config.username}:${config.apiToken}`).toString("base64");

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
