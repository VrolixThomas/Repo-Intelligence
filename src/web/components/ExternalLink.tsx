import type { AppConfig } from "../types";

interface Props {
  config: AppConfig;
  children: React.ReactNode;
  className?: string;
}

interface JiraLinkProps extends Props {
  jiraKey: string;
}

interface CommitLinkProps extends Props {
  repo: string;
  sha: string;
}

interface BranchLinkProps extends Props {
  repo: string;
  branch: string;
}

export function JiraLink({ config, jiraKey, children, className }: JiraLinkProps) {
  const url = `${config.jiraBaseUrl}/browse/${jiraKey}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-blue-600 hover:text-blue-800 hover:underline"}
    >
      {children}
    </a>
  );
}

export function CommitLink({ config, repo, sha, children, className }: CommitLinkProps) {
  const bb = config.bitbucket;
  const url = `${bb.base_url}/${bb.workspace}/${repo}/commits/${sha}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-blue-600 hover:text-blue-800 hover:underline font-mono"}
    >
      {children}
    </a>
  );
}

export function BranchLink({ config, repo, branch, children, className }: BranchLinkProps) {
  const bb = config.bitbucket;
  const url = `${bb.base_url}/${bb.workspace}/${repo}/branch/${branch}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-blue-600 hover:text-blue-800 hover:underline"}
    >
      {children}
    </a>
  );
}

interface PRLinkProps extends Props {
  repo: string;
  prId: number;
}

export function PRLink({ config, repo, prId, children, className }: PRLinkProps) {
  const bb = config.bitbucket;
  const url = `${bb.base_url}/${bb.workspace}/${repo}/pull-requests/${prId}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-blue-600 hover:text-blue-800 hover:underline"}
    >
      {children}
    </a>
  );
}
