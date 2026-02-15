import { useState, useEffect } from "react";
import { LineChart } from "../charts/LineChart";
import { BarChart } from "../charts/BarChart";
import { AreaChart } from "../charts/AreaChart";
import { fetchCommitVelocity, fetchCodeChurn, fetchPRCycleTime, fetchSprintBurndown } from "../../api";
import type {
  AppConfig,
  CommitVelocityData,
  CodeChurnData,
  PRCycleTimeData,
  SprintBurndownData,
} from "../../types";

interface Props {
  config: AppConfig;
  sprintId?: number | null;
}

type Tab = "velocity" | "churn" | "pr" | "burndown";

const MEMBER_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
];

function defaultSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0]!;
}

function defaultUntil(): string {
  return new Date().toISOString().split("T")[0]!;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function formatHours(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function emailToName(email: string, team: { name: string; emails: string[] }[]): string {
  for (const t of team) {
    if (t.emails.includes(email)) return t.name;
  }
  // Fallback: use part before @
  return email.split("@")[0] ?? email;
}

export function AnalyticsView({ config, sprintId }: Props) {
  const [tab, setTab] = useState<Tab>("velocity");
  const [since, setSince] = useState(defaultSince);
  const [until, setUntil] = useState(defaultUntil);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [velocity, setVelocity] = useState<CommitVelocityData | null>(null);
  const [churn, setChurn] = useState<CodeChurnData | null>(null);
  const [prCycle, setPrCycle] = useState<PRCycleTimeData | null>(null);
  const [burndown, setBurndown] = useState<SprintBurndownData | null>(null);

  // Member filter for velocity
  const [selectedMember, setSelectedMember] = useState("");

  // Presets
  const setPreset = (days: number) => {
    const u = new Date();
    const s = new Date();
    s.setDate(s.getDate() - days);
    setSince(s.toISOString().split("T")[0]!);
    setUntil(u.toISOString().split("T")[0]!);
  };

  // Fetch data when tab or date range changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    if (tab === "velocity") {
      fetchCommitVelocity(since, until, selectedMember || undefined)
        .then(setVelocity)
        .catch((err: any) => setError(err?.message ?? "Failed to load analytics"))
        .finally(() => setLoading(false));
    } else if (tab === "churn") {
      fetchCodeChurn(since, until)
        .then(setChurn)
        .catch((err: any) => setError(err?.message ?? "Failed to load analytics"))
        .finally(() => setLoading(false));
    } else if (tab === "pr") {
      fetchPRCycleTime(since, until)
        .then(setPrCycle)
        .catch((err: any) => setError(err?.message ?? "Failed to load analytics"))
        .finally(() => setLoading(false));
    } else if (tab === "burndown") {
      if (sprintId) {
        fetchSprintBurndown(sprintId)
          .then(setBurndown)
          .catch((err: any) => setError(err?.message ?? "Failed to load analytics"))
          .finally(() => setLoading(false));
      } else {
        setBurndown(null);
        setLoading(false);
      }
    }
  }, [tab, since, until, selectedMember, sprintId]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "velocity", label: "Velocity" },
    { key: "churn", label: "Code Churn" },
    { key: "pr", label: "PR Metrics" },
    { key: "burndown", label: "Sprint Burndown" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Analytics</h2>
        <p className="text-sm text-gray-500 mt-1">Trend charts for team velocity, code churn, PR metrics, and sprint burndown.</p>
      </div>

      {/* Date range controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">From</label>
          <input
            type="date"
            value={since}
            onChange={(e: any) => setSince(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <label className="text-gray-500">to</label>
          <input
            type="date"
            value={until}
            onChange={(e: any) => setUntil(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {[
            { label: "30d", days: 30 },
            { label: "60d", days: 60 },
            { label: "90d", days: 90 },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => setPreset(p.days)}
              className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 text-gray-600"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 px-4 py-3 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
                <div className="h-7 bg-gray-200 rounded w-12" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 h-64 animate-pulse">
            <div className="h-full bg-gray-100 rounded" />
          </div>
        </div>
      )}

      {/* Velocity Tab */}
      {!loading && tab === "velocity" && velocity && (
        <VelocityPanel data={velocity} config={config} selectedMember={selectedMember} onSelectMember={setSelectedMember} />
      )}

      {/* Churn Tab */}
      {!loading && tab === "churn" && churn && (
        <ChurnPanel data={churn} />
      )}

      {/* PR Tab */}
      {!loading && tab === "pr" && prCycle && (
        <PRPanel data={prCycle} config={config} />
      )}

      {/* Burndown Tab */}
      {!loading && tab === "burndown" && (
        <BurndownPanel data={burndown} sprintId={sprintId} />
      )}
    </div>
  );
}

function VelocityPanel({
  data,
  config,
  selectedMember,
  onSelectMember,
}: {
  data: CommitVelocityData;
  config: AppConfig;
  selectedMember: string;
  onSelectMember: (m: string) => void;
}) {
  // Build date series
  const dateSet = new Set(data.points.map((p) => p.date.split("T")[0]!));
  const dates = [...dateSet].sort();
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  // Group by member
  const memberMap = new Map<string, Map<string, number>>();
  for (const p of data.points) {
    const d = p.date.split("T")[0]!;
    if (!memberMap.has(p.authorEmail)) memberMap.set(p.authorEmail, new Map());
    memberMap.get(p.authorEmail)!.set(d, (memberMap.get(p.authorEmail)!.get(d) ?? 0) + p.count);
  }

  const members = [...memberMap.keys()];
  const totalCommits = data.points.reduce((s, p) => s + p.count, 0);
  const avgPerDay = dates.length > 0 ? Math.round(totalCommits / dates.length * 10) / 10 : 0;

  // Most active member
  const memberTotals = members.map((m) => {
    const counts = memberMap.get(m)!;
    let total = 0;
    for (const v of counts.values()) total += v;
    return { email: m, total };
  }).sort((a, b) => b.total - a.total);
  const topMember = memberTotals[0];

  // Peak day
  const dailyTotals = dates.map((d) => {
    let sum = 0;
    for (const counts of memberMap.values()) sum += counts.get(d) ?? 0;
    return { date: d, total: sum };
  }).sort((a, b) => b.total - a.total);
  const peakDay = dailyTotals[0];

  // Build chart series
  const series = members.map((email, i) => {
    const counts = memberMap.get(email)!;
    return {
      label: emailToName(email, config.team),
      color: MEMBER_COLORS[i % MEMBER_COLORS.length]!,
      data: dates.map((d, di) => ({ x: di, y: counts.get(d) ?? 0 })),
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Commits" value={String(totalCommits)} />
        <StatCard label="Avg / Day" value={String(avgPerDay)} />
        <StatCard
          label="Most Active"
          value={topMember ? emailToName(topMember.email, config.team) : "-"}
          sub={topMember ? `${topMember.total} commits` : undefined}
        />
        <StatCard
          label="Peak Day"
          value={peakDay ? String(peakDay.total) : "-"}
          sub={peakDay?.date}
        />
      </div>

      {/* Member filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-500">Filter by member:</label>
        <select
          value={selectedMember}
          onChange={(e: any) => onSelectMember(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
        >
          <option value="">All members</option>
          {data.members.map((m) => (
            <option key={m} value={m}>{emailToName(m, config.team)}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Commits per day</h3>
        <LineChart
          series={series}
          xLabels={dates}
          yLabel="Commits"
        />
      </div>
    </div>
  );
}

function ChurnPanel({ data }: { data: CodeChurnData }) {
  const points = data.points;
  const dates = points.map((p) => p.date);
  const totalIns = points.reduce((s, p) => s + p.insertions, 0);
  const totalDel = points.reduce((s, p) => s + p.deletions, 0);
  const netLines = totalIns - totalDel;
  const avgDailyChurn = dates.length > 0 ? Math.round((totalIns + totalDel) / dates.length) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Insertions" value={totalIns.toLocaleString()} />
        <StatCard label="Total Deletions" value={totalDel.toLocaleString()} />
        <StatCard label="Net Lines" value={(netLines >= 0 ? "+" : "") + netLines.toLocaleString()} />
        <StatCard label="Avg Daily Churn" value={avgDailyChurn.toLocaleString()} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Code churn per day</h3>
        <BarChart
          stacks={[
            { label: "Insertions", color: "#10b981", values: points.map((p) => p.insertions) },
            { label: "Deletions", color: "#ef4444", values: points.map((p) => p.deletions) },
          ]}
          xLabels={dates}
          yLabel="Lines"
          stacked={false}
        />
      </div>
    </div>
  );
}

function PRPanel({ data, config }: { data: PRCycleTimeData; config: AppConfig }) {
  const points = data.points;
  const merged = points.length;

  // Compute avg TTFR
  const ttfrValues = points.map((p) => p.timeToFirstReviewMins).filter((v): v is number => v !== null);
  const avgTTFR = ttfrValues.length > 0
    ? Math.round(ttfrValues.reduce((s, v) => s + v, 0) / ttfrValues.length)
    : 0;

  // Build chart data
  const dates = points.map((p) => p.date.split("T")[0]!);
  const uniqueDates = [...new Set(dates)].sort();
  const dateIndex = new Map(uniqueDates.map((d, i) => [d, i]));

  // TTM series — one point per PR
  const ttmSeries = {
    label: "Time to merge",
    color: "#3b82f6",
    data: points.map((p, i) => ({
      x: dateIndex.get(p.date.split("T")[0]!) ?? i,
      y: Math.round((p.timeToMergeMins ?? 0) / 60 * 10) / 10, // hours
    })),
  };

  // Rolling average (5 PR window)
  const rollingData: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const window = points.slice(Math.max(0, i - 4), i + 1);
    const avg = window.reduce((s, p) => s + (p.timeToMergeMins ?? 0), 0) / window.length;
    rollingData.push({
      x: dateIndex.get(points[i]!.date.split("T")[0]!) ?? i,
      y: Math.round(avg / 60 * 10) / 10,
    });
  }

  const rollingSeries = {
    label: "5-PR avg",
    color: "#f59e0b",
    data: rollingData,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Avg Time to Merge" value={formatHours(data.avgTimeToMergeMins)} />
        <StatCard label="Median TTM" value={formatHours(data.medianTimeToMergeMins)} />
        <StatCard label="Avg TTFR" value={formatHours(avgTTFR)} />
        <StatCard label="Merged PRs" value={String(merged)} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Time to merge (hours)</h3>
        <LineChart
          series={[ttmSeries, rollingSeries]}
          xLabels={uniqueDates}
          yLabel="Hours"
          formatY={(v) => `${v}h`}
        />
      </div>

      {/* TTFR chart */}
      {ttfrValues.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Time to first review (hours)</h3>
          <LineChart
            series={[{
              label: "Time to first review",
              color: "#8b5cf6",
              data: points
                .filter((p) => p.timeToFirstReviewMins !== null)
                .map((p, i) => ({
                  x: dateIndex.get(p.date.split("T")[0]!) ?? i,
                  y: Math.round((p.timeToFirstReviewMins ?? 0) / 60 * 10) / 10,
                })),
            }]}
            xLabels={uniqueDates}
            yLabel="Hours"
            formatY={(v) => `${v}h`}
          />
        </div>
      )}
    </div>
  );
}

function BurndownPanel({ data, sprintId }: { data: SprintBurndownData | null; sprintId?: number | null }) {
  if (!sprintId) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500 text-sm">Select a sprint from the sidebar to view the burndown chart.</p>
      </div>
    );
  }

  if (!data || data.days.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500 text-sm">No burndown data available for this sprint. Run a scan with Jira tickets to populate status change history.</p>
      </div>
    );
  }

  const { days, totalTickets, sprint } = data;
  const dates = days.map((d) => d.date);
  const lastDay = days[days.length - 1];
  const doneCount = lastDay?.done ?? 0;
  const remaining = lastDay?.remaining ?? totalTickets;
  const totalDayCommits = days.reduce((s, d) => s + d.commitsToday, 0);
  const avgDailyCommits = days.length > 0 ? Math.round(totalDayCommits / days.length * 10) / 10 : 0;

  // Ideal burndown line: linear from totalTickets to 0
  const idealBurndown = days.map((_, i) => {
    const progress = days.length > 1 ? i / (days.length - 1) : 1;
    return Math.round(totalTickets * (1 - progress));
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Tickets" value={String(totalTickets)} sub={sprint.name} />
        <StatCard label="Done" value={String(doneCount)} />
        <StatCard label="Remaining" value={String(remaining)} />
        <StatCard label="Avg Daily Commits" value={String(avgDailyCommits)} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Sprint burndown</h3>
        <AreaChart
          series={[
            { label: "Done", color: "#10b981", fillOpacity: 0.3, data: days.map((d) => d.done) },
            { label: "In Review", color: "#8b5cf6", fillOpacity: 0.3, data: days.map((d) => d.inReview) },
            { label: "In Progress", color: "#3b82f6", fillOpacity: 0.3, data: days.map((d) => d.inProgress) },
            { label: "To Do", color: "#9ca3af", fillOpacity: 0.3, data: days.map((d) => d.todo) },
          ]}
          xLabels={dates}
          yLabel="Tickets"
          referenceLine={{ y: totalTickets, label: "Total", color: "#6b7280" }}
        />
      </div>

      {/* Daily commits during sprint */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Daily commits during sprint</h3>
        <BarChart
          stacks={[
            { label: "Commits", color: "#3b82f6", values: days.map((d) => d.commitsToday) },
          ]}
          xLabels={dates}
          yLabel="Commits"
          height={160}
        />
      </div>
    </div>
  );
}
