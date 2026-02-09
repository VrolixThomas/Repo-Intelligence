import { mkdirSync } from "fs";
import { resolve } from "path";
import { getTicketSummariesForRun, getCommitsForRun, getTicketsByKeys, getRunById } from "../db/queries";
import type { Config } from "../config";
import type { RepoScanResult } from "../git/scanner";

export interface ReportInput {
  runId: number;
  config: Config;
  repoResults: RepoScanResult[];
  totalNewCommits: number;
  totalExisting: number;
}

export interface ReportOutput {
  filePath: string;
  markdown: string;
}

export async function generateReport(input: ReportInput): Promise<ReportOutput> {
  const { runId, config, repoResults, totalNewCommits } = input;

  // Query DB for ticket summaries and commits for this run
  const runTicketSummaries = await getTicketSummariesForRun(runId);
  const runCommits = await getCommitsForRun(runId);

  // Collect all Jira keys referenced in commits
  const allJiraKeys = new Set<string>();
  for (const c of runCommits) {
    if (c.jiraKeys) {
      for (const k of c.jiraKeys.split(",")) {
        allJiraKeys.add(k.trim());
      }
    }
  }

  // Fetch ticket data for the index
  const ticketRows = await getTicketsByKeys([...allJiraKeys]);
  const ticketMap = new Map(ticketRows.map((t) => [t.jiraKey, t]));

  // Get run start time from DB
  const runRow = await getRunById(runId);
  const runStartedAt = runRow?.startedAt ?? new Date().toISOString();

  // Format date using config timezone
  const tz = config.general.timezone ?? "UTC";
  const dateObj = new Date(runStartedAt);
  const dateStr = dateObj.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const timeStr = dateObj.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

  // Build email→name map from config
  const emailToName = new Map<string, string>();
  for (const member of config.team) {
    for (const email of member.emails) {
      emailToName.set(email.toLowerCase(), member.name);
    }
  }

  // Group commits by ticket key
  const commitsByTicket = new Map<string, typeof runCommits>();
  for (const c of runCommits) {
    const keys = new Set<string>();
    if (c.jiraKeys) {
      for (const k of c.jiraKeys.split(",")) keys.add(k.trim());
    }
    if (keys.size === 0) {
      // Orphan commit — group under branch pseudo-key
      const pseudoKey = `branch:${c.branch}`;
      const existing = commitsByTicket.get(pseudoKey);
      if (existing) {
        existing.push(c);
      } else {
        commitsByTicket.set(pseudoKey, [c]);
      }
    } else {
      for (const key of keys) {
        const existing = commitsByTicket.get(key);
        if (existing) {
          existing.push(c);
        } else {
          commitsByTicket.set(key, [c]);
        }
      }
    }
  }

  // Build summary lookup: key = jiraKey
  const summaryMap = new Map<string, typeof runTicketSummaries[number]>();
  for (const s of runTicketSummaries) {
    // If multiple summaries for same key (different repos), keep them keyed as key|repo
    const mapKey = `${s.jiraKey}|${s.repo}`;
    summaryMap.set(mapKey, s);
  }

  // Assemble markdown — ticket-centric layout
  const lines: string[] = [];

  lines.push(`# Daily Activity Report — ${dateStr}`);
  lines.push("");
  lines.push(`**Run #${runId}** | ${timeStr} | ${repoResults.length} repos scanned | ${totalNewCommits} new commits`);
  lines.push("");

  // Group ticket summaries: real tickets first, then orphans
  const realTickets = runTicketSummaries.filter((s) => !s.jiraKey.startsWith("branch:"));
  const orphanTickets = runTicketSummaries.filter((s) => s.jiraKey.startsWith("branch:"));

  for (const ts of realTickets) {
    const ticket = ticketMap.get(ts.jiraKey);
    const ticketCommits = commitsByTicket.get(ts.jiraKey) ?? [];

    lines.push("---");
    lines.push("");
    lines.push(`## ${ts.jiraKey}: ${ticket?.summary ?? "(unknown)"}`);
    lines.push("");

    if (ticket) {
      const statusParts = [`Status: ${ticket.status ?? "?"}`, `Assignee: ${ticket.assignee ?? "?"}`];
      lines.push(statusParts.join(" | "));
      lines.push("");
    }

    // Contributors
    const authors = ts.authorEmails?.split(",") ?? [];
    const authorNames = authors.map((e) => {
      const name = emailToName.get(e.trim().toLowerCase());
      const commitCount = ticketCommits.filter((c) => c.authorEmail === e.trim()).length;
      return `${name ?? e.trim()} (${commitCount} commits)`;
    });
    if (authorNames.length > 0) {
      lines.push(`**Contributors:** ${authorNames.join(", ")}`);
      lines.push("");
    }

    // Branches
    let branchNames: string[] = [];
    try { branchNames = JSON.parse(ts.branchNames ?? "[]"); } catch { /* ignore */ }
    if (branchNames.length > 0) {
      lines.push(`**Branches:** ${branchNames.join(", ")}`);
      lines.push("");
    }

    // Summary text
    lines.push(ts.summaryText);
    lines.push("");

    // Commit table
    if (ticketCommits.length > 0) {
      lines.push(`**Commits (${ticketCommits.length}):**`);
      lines.push("");
      lines.push("| SHA | Author | Message | Branch | +/- |");
      lines.push("|-----|--------|---------|--------|-----|");
      for (const c of ticketCommits) {
        const msg = c.message.split("\n")[0]?.slice(0, 80) ?? "";
        const shortBranch = c.branch.length > 40 ? c.branch.slice(0, 37) + "..." : c.branch;
        const authorName = emailToName.get(c.authorEmail.toLowerCase()) ?? c.authorName;
        lines.push(`| \`${c.shortSha}\` | ${escapeMarkdownTable(authorName)} | ${escapeMarkdownTable(msg)} | ${escapeMarkdownTable(shortBranch)} | +${c.insertions}/-${c.deletions} |`);
      }
      lines.push("");
    }
  }

  // Orphan sections
  if (orphanTickets.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Other Activity (no ticket)");
    lines.push("");

    for (const ts of orphanTickets) {
      const branchName = ts.jiraKey.replace("branch:", "");
      const ticketCommits = commitsByTicket.get(ts.jiraKey) ?? [];

      lines.push(`### Branch: ${branchName}`);
      lines.push("");
      lines.push(ts.summaryText);
      lines.push("");

      if (ticketCommits.length > 0) {
        lines.push("| SHA | Author | Message | +/- |");
        lines.push("|-----|--------|---------|-----|");
        for (const c of ticketCommits) {
          const msg = c.message.split("\n")[0]?.slice(0, 80) ?? "";
          const authorName = emailToName.get(c.authorEmail.toLowerCase()) ?? c.authorName;
          lines.push(`| \`${c.shortSha}\` | ${escapeMarkdownTable(authorName)} | ${escapeMarkdownTable(msg)} | +${c.insertions}/-${c.deletions} |`);
        }
        lines.push("");
      }
    }
  }

  // Ticket Index
  if (ticketRows.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Ticket Index");
    lines.push("");
    lines.push("| Key | Status | Summary | Assignee |");
    lines.push("|-----|--------|---------|----------|");
    for (const t of ticketRows.sort((a, b) => a.jiraKey.localeCompare(b.jiraKey))) {
      const summary = escapeMarkdownTable(t.summary?.slice(0, 80) ?? "");
      lines.push(`| ${t.jiraKey} | ${t.status ?? ""} | ${summary} | ${t.assignee ?? ""} |`);
    }
    lines.push("");
  }

  const markdown = lines.join("\n");

  // Write to file
  const outputDir = config.general.output_dir ?? "./data/reports";
  const resolvedDir = resolve(outputDir);
  mkdirSync(resolvedDir, { recursive: true });

  const fileName = `${dateStr}-run-${runId}.md`;
  const filePath = resolve(resolvedDir, fileName);
  await Bun.write(filePath, markdown);

  return { filePath, markdown };
}

function escapeMarkdownTable(str: string): string {
  return str.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
