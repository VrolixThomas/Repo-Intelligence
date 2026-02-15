import { loadConfig } from "./src/config";
import {
  getAllRuns,
  getRunById,
  getTicketSummariesForRun,
  getTicketSummariesByKey,
  getCommitsForRun,
  getTicketsByKeys,
  getCommitsPaginated,
  getMemberStats,
  getAllMemberStats,
  getMemberCommits,
  getMemberBranches,
  getMemberTicketSummaries,
  getReferencedTicketsGrouped,
  getTicketCommitCounts,
  getDashboardStats,
  getDistinctRepos,
  getDistinctAuthors,
  getBranchesWithCommits,
  getAllSprints,
  getActiveSprint,
  getSprintById,
  getSprintTickets,
  getSprintTicketKeys,
  getSprintCommits,
  getSprintBranches,
  getSprintTicketsGrouped,
  getEnrichedDailyActivity,
  getDailyCommitCounts,
  getTicketLifecycleMetrics,
  getTicketLifecycleForSprint,
  getPullRequestsPaginated,
  getPullRequestDetail,
  getPRDashboardStats,
  getReviewerStats,
  getPRFilters,
  getCommitVelocityByMember,
  getCodeChurnDaily,
  getPRCycleTimePoints,
  getSprintBurndown,
  getStandupData,
  getSprintSummary,
  getAllSprintSummaries,
} from "./src/db/queries";
import type { TicketLifecycleRow, PRFilter } from "./src/db/queries";
import type { CommitFilter } from "./src/db/queries";
import dashboard from "./src/web/index.html";

const config = loadConfig();
const port = config.web?.port ?? 3100;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getParams(url: URL): URLSearchParams {
  return url.searchParams;
}

Bun.serve({
  port,
  static: {
    "/": dashboard,
  },
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // ── API Routes ──────────────────────────────────────────────────

    if (path === "/api/config") {
      return json({
        timezone: config.general.timezone,
        jiraBaseUrl: config.jira.base_url,
        bitbucket: config.bitbucket,
        repos: config.repos.map((r) => ({ name: r.name, defaultBranch: r.default_branch })),
        team: config.team.map((t) => ({ name: t.name, emails: t.emails })),
      });
    }

    if (path === "/api/stats") {
      return json(await getDashboardStats());
    }

    if (path === "/api/runs") {
      return json(await getAllRuns());
    }

    // /api/runs/:id
    const runMatch = path.match(/^\/api\/runs\/(\d+)$/);
    if (runMatch) {
      const runId = Number(runMatch[1]);
      const [run, runTicketSummaries, runCommits] = await Promise.all([
        getRunById(runId),
        getTicketSummariesForRun(runId),
        getCommitsForRun(runId),
      ]);
      if (!run) return json({ error: "Run not found" }, 404);
      const jiraKeys = new Set<string>();
      for (const c of runCommits) {
        if (c.jiraKeys) {
          for (const k of c.jiraKeys.split(",")) jiraKeys.add(k.trim());
        }
      }
      const ticketRows = await getTicketsByKeys([...jiraKeys]);
      return json({ run, ticketSummaries: runTicketSummaries, commits: runCommits, tickets: ticketRows });
    }

    if (path === "/api/commits") {
      const params = getParams(url);
      const page = Number(params.get("page") ?? "1");
      const pageSize = Number(params.get("pageSize") ?? "20");
      const filter: CommitFilter = {};
      const repo = params.get("repo");
      const author = params.get("author");
      const since = params.get("since");
      const until = params.get("until");
      const search = params.get("search");
      if (repo) filter.repo = repo;
      if (author) filter.authorEmail = author;
      if (since) filter.since = since;
      if (until) filter.until = until;
      if (search) filter.search = search;
      return json(await getCommitsPaginated(filter, page, pageSize));
    }

    if (path === "/api/team") {
      return json(await getAllMemberStats(config.team));
    }

    // /api/team/:name
    const teamMatch = path.match(/^\/api\/team\/(.+)$/);
    if (teamMatch) {
      const name = decodeURIComponent(teamMatch[1]!);
      const member = config.team.find((t) => t.name === name);
      if (!member) return json({ error: "Member not found" }, 404);
      const params = getParams(url);
      const page = Number(params.get("page") ?? "1");
      const pageSize = Number(params.get("pageSize") ?? "20");
      const [stats, commitData, memberBranches, memberTicketSummaries] = await Promise.all([
        getMemberStats(member.emails),
        getMemberCommits(member.emails, page, pageSize),
        getMemberBranches(member.emails),
        getMemberTicketSummaries(member.emails, 5),
      ]);
      return json({
        name: member.name,
        emails: member.emails,
        ...stats,
        ...commitData,
        branches: memberBranches,
        ticketSummaries: memberTicketSummaries,
      });
    }

    if (path === "/api/tickets/by-status") {
      const params = getParams(url);
      const sprintIdParam = params.get("sprintId");
      const grouped = sprintIdParam
        ? await getSprintTicketsGrouped(Number(sprintIdParam))
        : await getReferencedTicketsGrouped();
      const allKeys = Object.values(grouped).flat().map((t) => t.jiraKey);
      // Parallelize commit counts and lifecycle metrics
      const [commitCounts, lifecycleRows] = await Promise.all([
        getTicketCommitCounts(allKeys),
        getTicketLifecycleMetrics(allKeys),
      ]);
      const lifecycle: Record<string, { durationDays: number; durationHours: number; idleDays: number; firstCommitDate: string; lastCommitDate: string }> = {};
      for (const row of lifecycleRows) {
        lifecycle[row.jiraKey] = {
          durationDays: row.durationDays,
          durationHours: row.durationHours,
          idleDays: row.idleDays,
          firstCommitDate: row.firstCommitDate,
          lastCommitDate: row.lastCommitDate,
        };
      }
      return json({ grouped, commitCounts, lifecycle });
    }

    if (path === "/api/branches") {
      const params = getParams(url);
      const filter: { repo?: string; authorEmail?: string } = {};
      const repo = params.get("repo");
      const author = params.get("author");
      if (repo) filter.repo = repo;
      if (author) filter.authorEmail = author;
      return json(await getBranchesWithCommits(filter));
    }

    if (path === "/api/filters") {
      const [repos, authors] = await Promise.all([getDistinctRepos(), getDistinctAuthors()]);
      return json({ repos, authors });
    }

    // ── Sprint API ──────────────────────────────────────────────────

    if (path === "/api/sprints") {
      return json(await getAllSprints());
    }

    if (path === "/api/sprints/active") {
      const active = await getActiveSprint();
      return json(active ?? null);
    }

    // /api/sprints/:id
    const sprintMatch = path.match(/^\/api\/sprints\/(\d+)$/);
    if (sprintMatch) {
      const sprintId = Number(sprintMatch[1]);
      const sprint = await getSprintById(sprintId);
      if (!sprint) return json({ error: "Sprint not found" }, 404);
      // Parallelize independent queries
      const [sprintTicketList, sprintBranches, sprintCommits, ticketKeys] = await Promise.all([
        getSprintTickets(sprintId),
        getSprintBranches(sprintId),
        getSprintCommits(sprintId),
        getSprintTicketKeys(sprintId),
      ]);
      const commitCounts = await getTicketCommitCounts(ticketKeys);
      return json({
        sprint,
        tickets: sprintTicketList,
        branches: sprintBranches,
        commits: sprintCommits,
        commitCounts,
        stats: {
          ticketCount: sprintTicketList.length,
          commitCount: sprintCommits.length,
          branchCount: sprintBranches.length,
          prCount: sprintBranches.filter((b) => b.branch.prId).length,
        },
      });
    }

    // ── Activity API ────────────────────────────────────────────────

    if (path === "/api/activity") {
      const params = getParams(url);
      const date = params.get("date");
      if (!date) return json({ error: "date parameter required" }, 400);
      const activity = await getEnrichedDailyActivity(config.team, date);
      return json(activity);
    }

    if (path === "/api/activity/range") {
      const params = getParams(url);
      const since = params.get("since");
      const until = params.get("until");
      if (!since || !until) return json({ error: "since and until parameters required" }, 400);
      const counts = await getDailyCommitCounts(since, until);
      return json(counts);
    }

    // ── Standup API ─────────────────────────────────────────────────

    if (path === "/api/standup") {
      const params = getParams(url);
      const date = params.get("date") ?? new Date().toISOString().split("T")[0]!;
      const data = await getStandupData(config.team, date);
      return json(data);
    }

    // ── Sprint Summary API ──────────────────────────────────────────

    if (path === "/api/sprint-summaries") {
      return json(await getAllSprintSummaries());
    }

    const sprintSummaryMatch = path.match(/^\/api\/sprint-summary\/(\d+)$/);
    if (sprintSummaryMatch) {
      const sprintId = Number(sprintSummaryMatch[1]);
      const summary = await getSprintSummary(sprintId);
      if (!summary) return json({ error: "Sprint summary not found" }, 404);
      return json(summary);
    }

    // ── Ticket Lifecycle API ─────────────────────────────────────────

    if (path === "/api/tickets/lifecycle") {
      const params = getParams(url);
      const sprintIdParam = params.get("sprintId");
      const sort = params.get("sort") ?? "idle";
      const staleThreshold = Number(params.get("staleThreshold") ?? "7");

      const metrics = sprintIdParam
        ? await getTicketLifecycleForSprint(Number(sprintIdParam))
        : await getTicketLifecycleMetrics();

      // Enrich with ticket data
      const allKeys = metrics.map((m) => m.jiraKey);
      const ticketRows = await getTicketsByKeys(allKeys);
      const ticketMap = new Map(ticketRows.map((t) => [t.jiraKey, t]));

      const enriched = metrics.map((m) => ({
        ...m,
        isStale: m.idleDays >= staleThreshold,
        ticket: ticketMap.get(m.jiraKey) ?? null,
      }));

      // Sort
      const sortFns: Record<string, (a: typeof enriched[number], b: typeof enriched[number]) => number> = {
        idle: (a, b) => b.idleDays - a.idleDays,
        duration: (a, b) => b.durationDays - a.durationDays,
        commits: (a, b) => b.commitCount - a.commitCount,
        recent: (a, b) => b.lastCommitDate.localeCompare(a.lastCommitDate),
      };
      const sortFn = sortFns[sort] ?? sortFns.idle!;
      enriched.sort(sortFn);

      const staleCount = enriched.filter((m) => m.isStale).length;
      const avgDuration = enriched.length > 0
        ? Math.round(enriched.reduce((s, m) => s + m.durationDays, 0) / enriched.length)
        : 0;
      const avgIdle = enriched.length > 0
        ? Math.round(enriched.reduce((s, m) => s + m.idleDays, 0) / enriched.length)
        : 0;

      return json({
        metrics: enriched,
        staleThreshold,
        summary: {
          totalTracked: enriched.length,
          staleCount,
          avgDuration,
          avgIdle,
        },
      });
    }

    // ── Pull Request API ──────────────────────────────────────────────

    if (path === "/api/pull-requests/stats") {
      const params = getParams(url);
      const repo = params.get("repo") ?? undefined;
      return json(await getPRDashboardStats(repo));
    }

    if (path === "/api/pull-requests/reviewers") {
      const params = getParams(url);
      const repo = params.get("repo") ?? undefined;
      return json(await getReviewerStats(repo));
    }

    if (path === "/api/pull-requests/filters") {
      return json(await getPRFilters());
    }

    // /api/pull-requests/:id (must come after /stats, /reviewers, /filters)
    const prDetailMatch = path.match(/^\/api\/pull-requests\/(\d+)$/);
    if (prDetailMatch) {
      const prRowId = Number(prDetailMatch[1]);
      const detail = await getPullRequestDetail(prRowId);
      if (!detail) return json({ error: "Pull request not found" }, 404);
      return json(detail);
    }

    if (path === "/api/pull-requests") {
      const params = getParams(url);
      const page = Number(params.get("page") ?? "1");
      const pageSize = Number(params.get("pageSize") ?? "20");
      const sort = params.get("sort") ?? "updated";
      const filter: PRFilter = {};
      const repo = params.get("repo");
      const state = params.get("state");
      const author = params.get("author");
      const since = params.get("since");
      const until = params.get("until");
      if (repo) filter.repo = repo;
      if (state) filter.state = state;
      if (author) filter.authorName = author;
      if (since) filter.since = since;
      if (until) filter.until = until;
      return json(await getPullRequestsPaginated(filter, page, pageSize, sort));
    }

    // ── Analytics API ────────────────────────────────────────────────

    if (path === "/api/analytics/commit-velocity") {
      const params = getParams(url);
      const since = params.get("since");
      const until = params.get("until");
      if (!since || !until) return json({ error: "since and until parameters required" }, 400);
      const memberEmail = params.get("member");
      const authorEmails = memberEmail ? [memberEmail] : undefined;
      const points = await getCommitVelocityByMember(since, until, authorEmails);
      const members = [...new Set(points.map((p) => p.authorEmail))];
      return json({ points, members });
    }

    if (path === "/api/analytics/code-churn") {
      const params = getParams(url);
      const since = params.get("since");
      const until = params.get("until");
      if (!since || !until) return json({ error: "since and until parameters required" }, 400);
      const points = await getCodeChurnDaily(since, until);
      return json({ points });
    }

    if (path === "/api/analytics/pr-cycle-time") {
      const params = getParams(url);
      const since = params.get("since") ?? undefined;
      const until = params.get("until") ?? undefined;
      const points = await getPRCycleTimePoints(since, until);
      const ttmValues = points.map((p) => p.timeToMergeMins).filter((v): v is number => v !== null);
      const avgTimeToMergeMins = ttmValues.length > 0
        ? Math.round(ttmValues.reduce((s, v) => s + v, 0) / ttmValues.length)
        : 0;
      const sorted = [...ttmValues].sort((a, b) => a - b);
      const medianTimeToMergeMins = sorted.length > 0
        ? sorted[Math.floor(sorted.length / 2)]!
        : 0;
      return json({ points, avgTimeToMergeMins, medianTimeToMergeMins });
    }

    if (path === "/api/analytics/sprint-burndown") {
      const params = getParams(url);
      const sprintIdParam = params.get("sprintId");
      if (!sprintIdParam) return json({ error: "sprintId parameter required" }, 400);
      const result = await getSprintBurndown(Number(sprintIdParam));
      if (!result) return json({ error: "Sprint not found or missing dates" }, 404);
      return json(result);
    }

    // ── Ticket Summary API ────────────────────────────────────────────

    if (path === "/api/ticket-summaries") {
      const params = getParams(url);
      const jiraKey = params.get("jiraKey");
      const runIdParam = params.get("runId");

      if (jiraKey) {
        return json(await getTicketSummariesByKey(jiraKey));
      } else if (runIdParam) {
        return json(await getTicketSummariesForRun(Number(runIdParam)));
      }
      return json({ error: "jiraKey or runId parameter required" }, 400);
    }

    // ── 404 for unknown API routes ──────────────────────────────────
    if (path.startsWith("/api/")) {
      return json({ error: "Not found" }, 404);
    }

    // ── Fallback: serve dashboard for SPA ───────────────────────────
    return new Response(Bun.file("./src/web/index.html"), {
      headers: { "Content-Type": "text/html" },
    });
  },
});

console.log(`Dashboard running at http://localhost:${port}`);
