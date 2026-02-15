import { useState, useEffect } from "react";
import { fetchSprintSummary, fetchSprintSummaries } from "../../api";
import type { AppConfig, Sprint, SprintSummaryData } from "../../types";

interface Props {
  config: AppConfig;
  sprintId: number | null;
  sprints: Sprint[];
}

function MarkdownBlock({ text }: { text: string }) {
  // Simple markdown-to-HTML for Claude output (headers, bold, lists, paragraphs)
  const html = text
    .replace(/^### (.+)$/gm, "<h4 class='text-sm font-semibold text-gray-800 mt-4 mb-1'>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3 class='text-base font-semibold text-gray-900 mt-5 mb-2'>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2 class='text-lg font-bold text-gray-900 mt-6 mb-2'>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\- (.+)$/gm, "<li class='text-sm text-gray-700 ml-4 list-disc'>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li class='text-sm text-gray-700 ml-4 list-decimal'>$1</li>")
    .replace(/\n{2,}/g, "</p><p class='text-sm text-gray-700 mt-2'>")
    .replace(/\n/g, "<br/>");

  return (
    <div
      className="prose prose-sm max-w-none text-gray-700"
      dangerouslySetInnerHTML={{ __html: `<p class='text-sm text-gray-700'>${html}</p>` }}
    />
  );
}

function StatsTable({ statsJson }: { statsJson: string | null }) {
  if (!statsJson) return null;
  let stats: any;
  try { stats = JSON.parse(statsJson); } catch { return null; }

  const { ticketStats, prMetrics, memberContributions, commitCount } = stats;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Ticket stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tickets</h4>
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-2xl font-bold text-gray-900">{ticketStats?.total ?? 0}</span><span className="text-xs text-gray-400 ml-1">total</span></div>
          <div><span className="text-2xl font-bold text-green-600">{ticketStats?.done ?? 0}</span><span className="text-xs text-gray-400 ml-1">done</span></div>
          <div><span className="text-lg font-semibold text-blue-600">{ticketStats?.inProgress ?? 0}</span><span className="text-xs text-gray-400 ml-1">in progress</span></div>
          <div><span className="text-lg font-semibold text-purple-600">{ticketStats?.inReview ?? 0}</span><span className="text-xs text-gray-400 ml-1">in review</span></div>
        </div>
      </div>

      {/* PR metrics */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">PRs & Commits</h4>
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-2xl font-bold text-gray-900">{prMetrics?.merged ?? 0}</span><span className="text-xs text-gray-400 ml-1">merged</span></div>
          <div><span className="text-2xl font-bold text-gray-900">{commitCount ?? 0}</span><span className="text-xs text-gray-400 ml-1">commits</span></div>
          <div><span className="text-lg font-semibold text-gray-600">{prMetrics?.avgTimeToMergeHours ?? 0}h</span><span className="text-xs text-gray-400 ml-1">avg merge</span></div>
          <div><span className="text-lg font-semibold text-gray-600">{prMetrics?.avgReviewRounds ?? 0}</span><span className="text-xs text-gray-400 ml-1">avg rounds</span></div>
        </div>
      </div>

      {/* Member contributions */}
      {memberContributions && memberContributions.length > 0 && (
        <div className="col-span-2 bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Team Contributions</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2">Member</th>
                <th className="pb-2 text-right">Commits</th>
                <th className="pb-2 text-right">Tickets</th>
                <th className="pb-2 text-right">PRs</th>
              </tr>
            </thead>
            <tbody>
              {memberContributions.filter((m: any) => m.commitCount > 0 || m.ticketCount > 0).map((m: any, i: number) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 font-medium text-gray-700">{m.name}</td>
                  <td className="py-1.5 text-right text-gray-600">{m.commitCount}</td>
                  <td className="py-1.5 text-right text-gray-600">{m.ticketCount}</td>
                  <td className="py-1.5 text-right text-gray-600">{m.prsMerged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SprintSummaryView({ config, sprintId, sprints }: Props) {
  const [summary, setSummary] = useState<SprintSummaryData | null>(null);
  const [allSummaries, setAllSummaries] = useState<SprintSummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"general" | "technical">("general");

  // Load all summaries to know which sprints have them
  useEffect(() => {
    fetchSprintSummaries().then(setAllSummaries).catch((err: any) => setError(err?.message ?? "Failed to load sprint summaries"));
  }, []);

  // Load specific sprint summary
  useEffect(() => {
    if (!sprintId) {
      setLoading(false);
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchSprintSummary(sprintId)
      .then((data) => {
        setSummary(data);
      })
      .catch((err: any) => {
        setSummary(null);
        setError(err?.message ?? "Failed to load sprint summary");
      })
      .finally(() => setLoading(false));
  }, [sprintId]);

  const sprint = sprints.find((s) => s.id === sprintId);
  const hasSummary = allSummaries.some((s) => s.sprintId === sprintId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Sprint Summary</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {sprint ? sprint.name : "Select a sprint from the sidebar"}
        </p>
      </div>

      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 animate-pulse h-64" />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {!loading && !summary && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-500 text-sm mb-2">No summary generated for this sprint yet.</p>
          <p className="text-gray-400 text-xs">
            Run <code className="bg-gray-100 px-1 py-0.5 rounded">bun run scan.ts --sprint-summary</code> to generate one.
          </p>

          {/* Show sprints that do have summaries */}
          {allSummaries.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-2">Sprints with summaries:</p>
              <div className="flex flex-wrap gap-1 justify-center">
                {allSummaries.map((s) => {
                  const sp = sprints.find((sp) => sp.id === s.sprintId);
                  return sp ? (
                    <span key={s.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {sp.name}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && summary && (
        <>
          {/* Stats */}
          <StatsTable statsJson={summary.statsJson} />

          {/* Tab navigation */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setTab("general")}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === "general" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Executive Summary
            </button>
            <button
              onClick={() => setTab("technical")}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === "technical" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Technical Summary
            </button>
          </div>

          {/* Content */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            {tab === "general" && <MarkdownBlock text={summary.generalSummary} />}
            {tab === "technical" && <MarkdownBlock text={summary.technicalSummary} />}
          </div>

          {/* Meta */}
          <div className="text-xs text-gray-400 flex gap-4">
            <span>Generated: {new Date(summary.createdAt).toLocaleString()}</span>
            {summary.reportPath && <span>Report: {summary.reportPath}</span>}
          </div>
        </>
      )}
    </div>
  );
}
