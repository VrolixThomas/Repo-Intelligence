import { parse } from "smol-toml";
import { readFileSync } from "fs";
import { resolve } from "path";

export interface RepoConfig {
  name: string;
  path: string;
  default_branch: string;
}

export interface TeamMember {
  name: string;
  emails: string[];
}

export interface JiraConfig {
  base_url: string;
  project_keys: string[];
}

export interface ClaudeConfig {
  max_diff_lines: number;
}

export interface BitbucketConfig {
  base_url: string;
  workspace: string;
}

export interface WebConfig {
  port: number;
}

export interface Config {
  general: {
    output_dir: string;
    timezone: string;
  };
  repos: RepoConfig[];
  jira: JiraConfig;
  team: TeamMember[];
  claude: ClaudeConfig;
  bitbucket?: BitbucketConfig;
  web?: WebConfig;
}

export function loadConfig(configPath?: string): Config {
  const p = configPath ?? resolve(process.cwd(), "config.toml");
  const raw = readFileSync(p, "utf-8");
  const parsed = parse(raw) as unknown as Config;

  // Validate required fields
  if (!parsed.repos || parsed.repos.length === 0) {
    throw new Error("config.toml: at least one [[repos]] entry is required");
  }
  if (!parsed.team || parsed.team.length === 0) {
    throw new Error("config.toml: at least one [[team]] entry is required");
  }

  // Defaults
  parsed.general ??= { output_dir: "./data/reports", timezone: "UTC" };
  parsed.claude ??= { max_diff_lines: 500 };
  parsed.bitbucket ??= { base_url: "https://bitbucket.org", workspace: "slotsgames" };
  parsed.web ??= { port: 3100 };

  return parsed;
}

/**
 * Build a Bitbucket commit URL.
 */
export function buildBitbucketCommitUrl(config: Config, repoName: string, sha: string): string {
  const bb = config.bitbucket!;
  return `${bb.base_url}/${bb.workspace}/${repoName}/commits/${sha}`;
}

/**
 * Build a Bitbucket branch URL.
 */
export function buildBitbucketBranchUrl(config: Config, repoName: string, branch: string): string {
  const bb = config.bitbucket!;
  return `${bb.base_url}/${bb.workspace}/${repoName}/branch/${branch}`;
}

/**
 * Build a Jira ticket URL.
 */
export function buildJiraTicketUrl(config: Config, jiraKey: string): string {
  return `${config.jira.base_url}/browse/${jiraKey}`;
}

/**
 * Build a reverse lookup: email -> team member name
 */
export function buildEmailMap(team: TeamMember[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const member of team) {
    for (const email of member.emails) {
      map.set(email.toLowerCase(), member.name);
    }
  }
  return map;
}
