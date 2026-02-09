import { useState } from "react";
import { CommitLink, BranchLink, JiraLink } from "./ExternalLink";
import { PRBadge } from "./PRBadge";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { FollowUpButton } from "./FollowUpButton";
import type { AppConfig, Commit, DailyBranchDetail, Ticket, TicketSummary } from "../types";

interface Props {
  config: AppConfig;
  name: string;
  commits: Commit[];
  branches: DailyBranchDetail[];
  tickets: Ticket[];
  ticketSummaries: TicketSummary[];
}

export function MemberDayCard({ config, name, commits, branches, tickets, ticketSummaries }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasActivity = commits.length > 0;
  const initials = name.split(" ").map((w) => w[0] ?? "").join("").toUpperCase().slice(0, 2);

  const branchCount = branches.length;
  const totalInsertions = commits.reduce((s, c) => s + c.insertions, 0);
  const totalDeletions = commits.reduce((s, c) => s + c.deletions, 0);

  // Group commits by branch
  const commitsByBranch = new Map<string, Commit[]>();
  for (const c of commits) {
    const key = `${c.repo}::${c.branch}`;
    if (!commitsByBranch.has(key)) commitsByBranch.set(key, []);
    commitsByBranch.get(key)!.push(c);
  }

  // Build a lookup from "repo::branch" to DailyBranchDetail
  const branchDetailMap = new Map<string, DailyBranchDetail>();
  for (const bd of branches) {
    branchDetailMap.set(`${bd.repo}::${bd.name}`, bd);
  }

  // Summary headline: first ticket summary's first non-empty line
  const firstSummary = ticketSummaries[0];
  const summaryHeadline = firstSummary
    ? firstSummary.summaryText.split("\n").find((l) => l.trim().length > 0)?.replace(/^#+\s*/, "").trim() ?? null
    : null;

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all ${
      hasActivity ? "" : "opacity-60"
    }`}>
      {/* Collapsed header */}
      <button
        onClick={() => hasActivity && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${hasActivity ? "cursor-pointer hover:bg-gray-50" : "cursor-default"}`}
        disabled={!hasActivity}
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          hasActivity
            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
            : "bg-gray-200 text-gray-500"
        }`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${hasActivity ? "text-gray-900" : "text-gray-500"}`}>{name}</p>
          {summaryHeadline && (
            <p className="text-xs text-gray-500 truncate mt-0.5 italic">"{summaryHeadline}"</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {hasActivity ? (
              <>
                <span>{commits.length} commit{commits.length !== 1 ? "s" : ""}</span>
                <span className="text-gray-300">|</span>
                <span>{branchCount} branch{branchCount !== 1 ? "es" : ""}</span>
                <span className="text-gray-300">|</span>
                <span className="text-green-600">+{totalInsertions}</span>
                <span className="text-red-600">-{totalDeletions}</span>
              </>
            ) : (
              <span>No activity</span>
            )}
          </div>
          {hasActivity && !expanded && ticketSummaries.length > 0 && (
            <FollowUpButton sessionId={firstSummary?.sessionId ?? null} ticketKey={firstSummary?.jiraKey} memberName={name} />
          )}
          {hasActivity && (
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && hasActivity && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-4">
          {/* Ticket summaries */}
          {ticketSummaries.length > 0 && (
            <div className="space-y-3">
              {ticketSummaries.map((ts) => (
                <div key={ts.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                        {ts.jiraKey.startsWith("branch:") ? ts.jiraKey.replace("branch:", "Branch: ") : ts.jiraKey}
                      </p>
                      {ts.repo && <span className="text-[10px] text-gray-400">{ts.repo}</span>}
                    </div>
                    <FollowUpButton sessionId={ts.sessionId} ticketKey={ts.jiraKey.startsWith("branch:") ? undefined : ts.jiraKey} memberName={name} />
                  </div>
                  <MarkdownRenderer content={ts.summaryText} className="text-xs text-gray-700" />
                </div>
              ))}
            </div>
          )}

          {/* Branches with commits */}
          {[...commitsByBranch.entries()].map(([key, branchCommits]) => {
            const detail = branchDetailMap.get(key);
            const branchName = key.split("::")[1] ?? key;
            const repo = key.split("::")[0] ?? "";
            const branchRow = detail?.branch ?? null;
            const ticket = detail?.ticket ?? null;

            return (
              <div key={key}>
                {/* Branch header */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <BranchLink config={config} repo={repo} branch={branchName}>
                    <span className="text-xs font-semibold text-gray-800 hover:text-blue-600 font-mono">{branchName}</span>
                  </BranchLink>
                  <PRBadge
                    state={branchRow?.prState as any ?? null}
                    url={branchRow?.prUrl}
                    compact
                  />
                  {branchRow?.prTargetBranch && branchRow?.prState && (
                    <span className="text-[10px] text-gray-400">
                      &rarr; {branchRow.prTargetBranch}
                    </span>
                  )}
                  {ticket && (
                    <JiraLink config={config} jiraKey={ticket.jiraKey}>
                      <span className="text-[10px] font-medium text-blue-600">{ticket.jiraKey}</span>
                    </JiraLink>
                  )}
                  {ticket?.status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{ticket.status}</span>
                  )}
                </div>
                {/* Commits under this branch */}
                <div className="space-y-1 ml-3">
                  {branchCommits.map((c) => (
                    <div key={c.sha} className="flex items-center gap-2 text-xs">
                      <CommitLink config={config} repo={c.repo} sha={c.sha}>
                        <span className="font-mono text-blue-600">{c.shortSha}</span>
                      </CommitLink>
                      <span className="text-gray-700 truncate">{c.message.split("\n")[0]}</span>
                      <span className="text-gray-400 shrink-0 ml-auto whitespace-nowrap">
                        <span className="text-green-600">+{c.insertions}</span>
                        <span className="text-red-600 ml-1">-{c.deletions}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
