import simpleGit, { type SimpleGit, type LogResult } from "simple-git";
import type { RepoConfig } from "../config";

export interface BranchInfo {
  name: string; // e.g. "feature/PROJ-123-user-settings"
  remote: string; // e.g. "origin"
  lastCommitSha: string;
  lastCommitDate: string;
  lastCommitAuthorEmail: string;
  lastCommitMessage: string;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  authorName: string;
  authorEmail: string;
  date: string; // ISO string
  message: string;
  branch: string;
  repo: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  diffStat: string; // --stat output
  jiraKeys: string[]; // extracted ticket IDs
}

export interface RepoScanResult {
  repoName: string;
  repoPath: string;
  branches: BranchInfo[];
  commits: CommitInfo[];
  errors: string[];
}

/** Regex to extract Jira ticket IDs from strings (branch names, commit messages) */
const JIRA_KEY_REGEX = /([A-Z][A-Z0-9]+-(?!0+\b)\d+)/g;

export function extractJiraKeys(text: string): string[] {
  const matches = text.match(JIRA_KEY_REGEX) ?? [];
  return [...new Set(matches)];
}

/**
 * Create a git instance for a repo, fetch all remotes.
 */
async function initRepo(repoPath: string): Promise<SimpleGit> {
  const git = simpleGit(repoPath);

  // Verify it's a git repo
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error(`Not a git repository: ${repoPath}`);
  }

  await git.fetch(["--all", "--prune"]);
  return git;
}

/**
 * List all remote branches with their latest commit info.
 */
async function listBranches(git: SimpleGit): Promise<BranchInfo[]> {
  // Get remote branches with format: sha | date | email | message | refname
  const separator = "|||";
  const format = `%H${separator}%aI${separator}%ae${separator}%s${separator}%D`;

  const raw = await git.raw([
    "branch",
    "-r",
    `--format=%(objectname)${separator}%(authordate:iso-strict)${separator}%(authoremail)${separator}%(subject)${separator}%(refname:short)`,
    "--sort=-authordate",
  ]);

  const branches: BranchInfo[] = [];

  for (const line of raw.trim().split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(separator);
    if (parts.length < 5) continue;

    const [sha, date, rawEmail, message, fullRef] = parts;
    // Skip HEAD pointer and release branches
    if (fullRef.includes("HEAD")) continue;
    if (fullRef.includes("release/")) continue;

    // Parse remote and branch name from e.g. "origin/feature/foo"
    const slashIdx = fullRef.indexOf("/");
    const remote = slashIdx > 0 ? fullRef.substring(0, slashIdx) : "origin";
    const name = slashIdx > 0 ? fullRef.substring(slashIdx + 1) : fullRef;

    // Strip angle brackets from email
    const email = rawEmail.replace(/[<>]/g, "");

    branches.push({
      name,
      remote,
      lastCommitSha: sha,
      lastCommitDate: date,
      lastCommitAuthorEmail: email,
      lastCommitMessage: message,
    });
  }

  return branches;
}

/**
 * Get commits on a branch since a given date.
 * If sinceDate is not provided, defaults to 24 hours ago.
 */
async function getCommits(
  git: SimpleGit,
  repoName: string,
  branch: string,
  sinceDate?: string,
  untilDate?: string
): Promise<CommitInfo[]> {
  const since = sinceDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let log: LogResult;
  try {
    const logOpts: Record<string, any> = {
      [`origin/${branch}`]: null,
      "--since": since,
      "--no-merges": null,
    };
    if (untilDate) logOpts["--until"] = untilDate;
    log = await git.log(logOpts as any);
  } catch {
    // Branch might not exist on remote or have no commits in range
    return [];
  }

  const commits: CommitInfo[] = [];

  for (const entry of log.all) {
    // Get diff stats for this commit
    let diffStat = "";
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    try {
      const stat = await git.diffSummary([`${entry.hash}^..${entry.hash}`]);
      filesChanged = stat.files.length;
      insertions = stat.insertions;
      deletions = stat.deletions;
      diffStat = stat.files
        .map((f) => `  ${f.file} | +${f.insertions} -${f.deletions}`)
        .join("\n");
    } catch {
      // First commit in repo has no parent
    }

    const message = entry.message + (entry.body ? "\n" + entry.body : "");

    commits.push({
      sha: entry.hash,
      shortSha: entry.hash.substring(0, 8),
      authorName: entry.author_name,
      authorEmail: entry.author_email.toLowerCase(),
      date: entry.date,
      message: message.trim(),
      branch,
      repo: repoName,
      filesChanged,
      insertions,
      deletions,
      diffStat,
      jiraKeys: extractJiraKeys(message + " " + branch),
    });
  }

  return commits;
}

/**
 * Scan a single repository: fetch, list branches, collect recent commits.
 */
export async function scanRepo(
  repoConfig: RepoConfig,
  sinceDate?: string,
  untilDate?: string
): Promise<RepoScanResult> {
  const errors: string[] = [];
  let git: SimpleGit;

  try {
    git = await initRepo(repoConfig.path);
  } catch (err: any) {
    return {
      repoName: repoConfig.name,
      repoPath: repoConfig.path,
      branches: [],
      commits: [],
      errors: [`Failed to init repo: ${err.message}`],
    };
  }

  // List all remote branches
  let branches: BranchInfo[] = [];
  try {
    branches = await listBranches(git);
  } catch (err: any) {
    errors.push(`Failed to list branches: ${err.message}`);
  }

  // Collect commits from each branch
  const allCommits: CommitInfo[] = [];
  const seenShas = new Set<string>();

  for (const branch of branches) {
    try {
      const commits = await getCommits(git, repoConfig.name, branch.name, sinceDate, untilDate);
      for (const commit of commits) {
        // Deduplicate commits that appear on multiple branches
        if (!seenShas.has(commit.sha)) {
          seenShas.add(commit.sha);
          allCommits.push(commit);
        }
      }
    } catch (err: any) {
      errors.push(`Failed to get commits for ${branch.name}: ${err.message}`);
    }
  }

  // Sort by date descending
  allCommits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    repoName: repoConfig.name,
    repoPath: repoConfig.path,
    branches,
    commits: allCommits,
    errors,
  };
}

/**
 * Scan all configured repositories.
 */
export async function scanAllRepos(
  repos: RepoConfig[],
  sinceDate?: string,
  untilDate?: string
): Promise<RepoScanResult[]> {
  const results: RepoScanResult[] = [];
  for (const repo of repos) {
    console.log(`Scanning ${repo.name} at ${repo.path}...`);
    const result = await scanRepo(repo, sinceDate, untilDate);
    results.push(result);

    if (result.errors.length > 0) {
      console.warn(`  Warnings for ${repo.name}:`, result.errors);
    }
    console.log(`  Found ${result.branches.length} branches, ${result.commits.length} new commits`);
  }
  return results;
}
