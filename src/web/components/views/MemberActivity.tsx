import { useState, useEffect } from "react";
import { Pagination } from "../Pagination";
import { CommitLink, BranchLink, JiraLink } from "../ExternalLink";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { FollowUpButton } from "../FollowUpButton";
import { fetchTeam, fetchMemberDetail } from "../../api";
import type { AppConfig, TeamMember, MemberDetail } from "../../types";

interface Props {
  config: AppConfig;
}

const PAGE_SIZE = 20;

export function MemberActivity({ config }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeam().then((m) => {
      setMembers(m);
      setLoading(false);
    });
  }, []);

  const selectMember = async (name: string) => {
    if (selectedName === name) {
      setSelectedName(null);
      setDetail(null);
      return;
    }
    setSelectedName(name);
    setPage(1);
    setDetail(null);
    const d = await fetchMemberDetail(name, 1, PAGE_SIZE);
    setDetail(d);
  };

  const changePage = async (newPage: number) => {
    if (!selectedName) return;
    setPage(newPage);
    setDetail(null);
    const d = await fetchMemberDetail(selectedName, newPage, PAGE_SIZE);
    setDetail(d);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 bg-gray-200 rounded w-40 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full" />
                <div className="h-4 bg-gray-200 rounded w-32" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="h-8 bg-gray-100 rounded" />
                <div className="h-8 bg-gray-100 rounded" />
                <div className="h-8 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Team Members</h2>
        <p className="text-sm text-gray-500 mt-1">Individual activity and summaries per team member</p>
      </div>

      {/* Team grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {members.map((m) => {
          const initials = m.name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
          return (
            <button
              key={m.name}
              onClick={() => selectMember(m.name)}
              className={`text-left bg-white rounded-xl border shadow-sm p-4 transition-all ${
                selectedName === m.name ? "ring-2 ring-blue-500 border-blue-300" : "border-gray-200 hover:shadow-md"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold shrink-0">
                  {initials}
                </div>
                <h3 className="font-semibold text-gray-900">{m.name}</h3>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Commits</span>
                  <p className="font-bold text-gray-800 text-base">{m.commitCount}</p>
                </div>
                <div>
                  <span className="text-gray-500">Branches</span>
                  <p className="font-bold text-gray-800 text-base">{m.activeBranchCount}</p>
                </div>
                <div>
                  <span className="text-gray-500">Last Active</span>
                  <p className="font-bold text-gray-800">
                    {m.lastActivity ? formatRelative(m.lastActivity) : "N/A"}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      {selectedName && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-3 border-b bg-gray-50/50 rounded-t-xl">
            <h3 className="font-semibold text-gray-700">{selectedName}</h3>
          </div>

          {!detail ? (
            <div className="p-5 animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-20 bg-gray-100 rounded" />
            </div>
          ) : (
            <div className="p-5 space-y-6">
              {/* Latest ticket summaries */}
              {detail.ticketSummaries.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 text-sm">Latest Ticket Summaries</h4>
                  <div className="space-y-3">
                    {detail.ticketSummaries.map((s) => {
                      const label = s.jiraKey.startsWith("branch:") ? s.jiraKey.replace("branch:", "Branch: ") : s.jiraKey;
                      return (
                        <div key={s.id} className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span className="font-medium text-gray-700">{label}</span>
                              {s.repo && <span className="font-medium text-gray-600">{s.repo}</span>}
                              <span>{new Date(s.createdAt).toLocaleDateString("en-CA")}</span>
                              {s.runId && <span className="text-gray-400">Run #{s.runId}</span>}
                            </div>
                            <FollowUpButton sessionId={s.sessionId} ticketKey={s.jiraKey.startsWith("branch:") ? undefined : s.jiraKey} memberName={selectedName ?? undefined} runId={s.runId ?? undefined} />
                          </div>
                          <MarkdownRenderer content={s.summaryText} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Commits */}
              <div>
                <h4 className="font-semibold text-gray-700 mb-2 text-sm">
                  Commits ({detail.total})
                </h4>
                {detail.commits.length === 0 ? (
                  <p className="text-gray-500 text-sm">No commits found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-600">
                          <th className="px-2 py-1.5 font-medium">SHA</th>
                          <th className="px-2 py-1.5 font-medium">Message</th>
                          <th className="px-2 py-1.5 font-medium">Date</th>
                          <th className="px-2 py-1.5 font-medium">+/-</th>
                          <th className="px-2 py-1.5 font-medium">Tickets</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.commits.map((c) => (
                          <tr key={c.sha} className="border-b border-gray-100 even:bg-gray-50/50 hover:bg-gray-50">
                            <td className="px-2 py-1.5">
                              <CommitLink config={config} repo={c.repo} sha={c.sha}>
                                {c.shortSha}
                              </CommitLink>
                            </td>
                            <td className="px-2 py-1.5 max-w-sm truncate">{c.message.split("\n")[0]}</td>
                            <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                              {formatDate(c.timestamp, config.timezone)}
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <span className="text-green-600">+{c.insertions}</span>
                              <span className="text-red-600 ml-1">-{c.deletions}</span>
                            </td>
                            <td className="px-2 py-1.5">
                              {c.jiraKeys && c.jiraKeys.split(",").map((k) => (
                                <JiraLink key={k.trim()} config={config} jiraKey={k.trim()} className="text-blue-600 hover:underline text-xs mr-1">
                                  {k.trim()}
                                </JiraLink>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <Pagination
                  page={page}
                  totalPages={Math.ceil(detail.total / PAGE_SIZE)}
                  onPageChange={changePage}
                />
              </div>

              {/* Active branches */}
              {detail.branches.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 text-sm">
                    Active Branches ({detail.branches.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {detail.branches.map((b) => (
                      <div key={b.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 border border-gray-200 text-xs">
                        <BranchLink config={config} repo={b.repo} branch={b.name}>
                          {b.name.length > 50 ? b.name.slice(0, 47) + "..." : b.name}
                        </BranchLink>
                        {b.jiraKey && (
                          <JiraLink config={config} jiraKey={b.jiraKey} className="text-blue-600 hover:underline text-xs ml-1">
                            {b.jiraKey}
                          </JiraLink>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string, timezone: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { timeZone: timezone }) +
    " " +
    d.toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
