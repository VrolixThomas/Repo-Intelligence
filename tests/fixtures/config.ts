/**
 * Shared test fixtures for Config objects.
 */
import type { Config, TeamMember } from "../../src/config";

export const testTeam: TeamMember[] = [
  { name: "Alice Dev", emails: ["alice@example.com", "alice.dev@company.com"] },
  { name: "Bob QA", emails: ["bob@example.com"] },
  { name: "Charlie Ops", emails: ["charlie@example.com"] },
];

export const testConfig: Config = {
  general: { output_dir: "./data/reports", timezone: "Europe/Brussels" },
  repos: [
    { name: "my-repo", path: "/path/to/my-repo", default_branch: "main" },
    { name: "other-repo", path: "/path/to/other-repo", default_branch: "develop" },
  ],
  jira: { base_url: "https://jira.example.com", project_keys: ["PI", "INFRA"] },
  team: testTeam,
  claude: { max_diff_lines: 500 },
  bitbucket: { base_url: "https://bitbucket.org", workspace: "myworkspace" },
  web: { port: 3100 },
};
