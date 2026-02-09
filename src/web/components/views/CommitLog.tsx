import { useState, useEffect } from "react";
import { Pagination } from "../Pagination";
import { CommitLink, JiraLink } from "../ExternalLink";
import { fetchCommits, fetchFilters } from "../../api";
import type { AppConfig, Commit } from "../../types";

interface Props {
  config: AppConfig;
}

const PAGE_SIZE = 20;

export function CommitLog({ config }: Props) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [repos, setRepos] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [filterRepo, setFilterRepo] = useState("");
  const [filterAuthor, setFilterAuthor] = useState("");
  const [filterSince, setFilterSince] = useState("");
  const [filterUntil, setFilterUntil] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Build email->name map
  const emailToName = new Map<string, string>();
  for (const member of config.team) {
    for (const email of member.emails) {
      emailToName.set(email.toLowerCase(), member.name);
    }
  }

  useEffect(() => {
    fetchFilters().then((f) => {
      setRepos(f.repos);
      setAuthors(f.authors);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchCommits({
      page,
      pageSize: PAGE_SIZE,
      repo: filterRepo || undefined,
      author: filterAuthor || undefined,
      since: filterSince || undefined,
      until: filterUntil || undefined,
      search: filterSearch || undefined,
    }).then((data) => {
      setCommits(data.commits);
      setTotal(data.total);
      setLoading(false);
    });
  }, [page, filterRepo, filterAuthor, filterSince, filterUntil, filterSearch]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const applyFilter = () => {
    setPage(1);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Commit Log</h2>
        <p className="text-sm text-gray-500 mt-1">Browse and filter all tracked commits</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <select
            value={filterRepo}
            onChange={(e) => { setFilterRepo(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All repos</option>
            {repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          <select
            value={filterAuthor}
            onChange={(e) => { setFilterAuthor(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All authors</option>
            {authors.map((a) => (
              <option key={a} value={a}>{emailToName.get(a.toLowerCase()) ?? a}</option>
            ))}
          </select>

          <input
            type="date"
            value={filterSince}
            onChange={(e) => { setFilterSince(e.target.value); setPage(1); }}
            placeholder="Since"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />

          <input
            type="date"
            value={filterUntil}
            onChange={(e) => { setFilterUntil(e.target.value); setPage(1); }}
            placeholder="Until"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />

          <input
            type="text"
            value={filterSearch}
            onChange={(e) => { setFilterSearch(e.target.value); setPage(1); }}
            placeholder="Search messages..."
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-3 border-b bg-gray-50/50 rounded-t-xl flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700">
            {total} commit{total !== 1 ? "s" : ""}
          </h3>
        </div>

        {loading ? (
          <div className="p-5 animate-pulse space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 bg-gray-100 rounded" />
            ))}
          </div>
        ) : commits.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <p className="text-gray-500 text-sm">No commits found matching your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th className="px-3 py-2.5 font-medium">SHA</th>
                  <th className="px-3 py-2.5 font-medium">Message</th>
                  <th className="px-3 py-2.5 font-medium">Author</th>
                  <th className="px-3 py-2.5 font-medium">Branch</th>
                  <th className="px-3 py-2.5 font-medium">Repo</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Files</th>
                  <th className="px-3 py-2.5 font-medium">+/-</th>
                  <th className="px-3 py-2.5 font-medium">Tickets</th>
                </tr>
              </thead>
              <tbody>
                {commits.map((c) => (
                  <tr key={c.sha} className="border-b border-gray-100 even:bg-gray-50/50 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <CommitLink config={config} repo={c.repo} sha={c.sha}>
                        {c.shortSha}
                      </CommitLink>
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate">{c.message.split("\n")[0]}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {emailToName.get(c.authorEmail.toLowerCase()) ?? c.authorName}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-[150px] truncate" title={c.branch}>
                      {c.branch}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{c.repo}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(c.timestamp, config.timezone)}
                    </td>
                    <td className="px-3 py-2 text-center">{c.filesChanged}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-green-600">+{c.insertions}</span>
                      <span className="text-red-600 ml-1">-{c.deletions}</span>
                    </td>
                    <td className="px-3 py-2">
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

        <div className="p-3">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string, timezone: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { timeZone: timezone }) +
    " " +
    d.toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
}
