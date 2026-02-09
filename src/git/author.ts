import type { TeamMember } from "../config";
import type { CommitInfo, BranchInfo } from "./scanner";

export interface TeamActivity {
  memberName: string;
  emails: string[];
  branches: BranchInfo[];
  commits: CommitInfo[];
}

/**
 * Group commits and branches by team member.
 * Commits/branches from unknown authors go into an "Unknown" group.
 */
export function groupByTeamMember(
  team: TeamMember[],
  branches: BranchInfo[],
  commits: CommitInfo[]
): TeamActivity[] {
  // Build email → member name lookup
  const emailToName = new Map<string, string>();
  for (const member of team) {
    for (const email of member.emails) {
      emailToName.set(email.toLowerCase(), member.name);
    }
  }

  // Group commits by member
  const commitsByMember = new Map<string, CommitInfo[]>();
  const unknownCommits: CommitInfo[] = [];

  for (const commit of commits) {
    const name = emailToName.get(commit.authorEmail);
    if (name) {
      const list = commitsByMember.get(name) ?? [];
      list.push(commit);
      commitsByMember.set(name, list);
    } else {
      unknownCommits.push(commit);
    }
  }

  // Group branches by member (based on last commit author)
  const branchesByMember = new Map<string, BranchInfo[]>();
  const unknownBranches: BranchInfo[] = [];

  for (const branch of branches) {
    const email = branch.lastCommitAuthorEmail.toLowerCase();
    const name = emailToName.get(email);
    if (name) {
      const list = branchesByMember.get(name) ?? [];
      list.push(branch);
      branchesByMember.set(name, list);
    } else {
      unknownBranches.push(branch);
    }
  }

  // Build result
  const activities: TeamActivity[] = [];

  for (const member of team) {
    activities.push({
      memberName: member.name,
      emails: member.emails,
      branches: branchesByMember.get(member.name) ?? [],
      commits: commitsByMember.get(member.name) ?? [],
    });
  }

  // Add unknown authors if any
  if (unknownCommits.length > 0 || unknownBranches.length > 0) {
    activities.push({
      memberName: "Unknown",
      emails: [],
      branches: unknownBranches,
      commits: unknownCommits,
    });
  }

  return activities;
}
