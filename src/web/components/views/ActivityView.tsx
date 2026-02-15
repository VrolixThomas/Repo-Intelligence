import { useState, useEffect } from "react";
import { CalendarStrip } from "../CalendarStrip";
import { MemberDayCard } from "../MemberDayCard";
import { fetchActivity, fetchActivityRange } from "../../api";
import type { AppConfig, Sprint, DailyActivity, DailyCommitCount } from "../../types";

interface Props {
  config: AppConfig;
  sprint: Sprint | null;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0]!;
}

function getInitialRange(sprint: Sprint | null): { start: string; end: string } {
  if (sprint?.startDate && sprint?.endDate) {
    return {
      start: sprint.startDate.split("T")[0]!,
      end: sprint.endDate.split("T")[0]!,
    };
  }
  // Default: last 30 days
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86_400_000);
  return {
    start: start.toISOString().split("T")[0]!,
    end: end.toISOString().split("T")[0]!,
  };
}

/** Shift a date string by N days */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

function getDefaultDate(sprint: Sprint | null): string {
  const today = getToday();
  if (sprint?.endDate) {
    const endDate = sprint.endDate.split("T")[0]!;
    if (today > endDate) return endDate;
  }
  return today;
}

export function ActivityView({ config, sprint }: Props) {
  const initial = getInitialRange(sprint);
  const [rangeStart, setRangeStart] = useState(initial.start);
  const [rangeEnd, setRangeEnd] = useState(initial.end);
  const [selectedDate, setSelectedDate] = useState(getDefaultDate(sprint));
  const [activityCounts, setActivityCounts] = useState<Map<string, number>>(new Map());
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [loadingRange, setLoadingRange] = useState(true);
  const [loadingDay, setLoadingDay] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-expand range when selected date goes outside
  const handleSelectDate = (date: string) => {
    if (date < rangeStart) {
      setRangeStart(shiftDate(date, -7)); // extend 7 days before
    }
    if (date > rangeEnd) {
      setRangeEnd(shiftDate(date, 7)); // extend 7 days after
    }
    setSelectedDate(date);
  };

  // Fetch date range activity counts
  useEffect(() => {
    setLoadingRange(true);
    setError(null);
    fetchActivityRange(rangeStart, rangeEnd).then((counts) => {
      const map = new Map<string, number>();
      for (const c of counts) {
        map.set(c.date, c.count);
      }
      setActivityCounts(map);
    }).catch((err: any) => setError(err?.message ?? "Failed to load data")).finally(() => setLoadingRange(false));
  }, [rangeStart, rangeEnd]);

  // Fetch daily activity for selected date
  useEffect(() => {
    setLoadingDay(true);
    setError(null);
    fetchActivity(selectedDate).then((data) => {
      setDailyActivity(data);
    }).catch((err: any) => setError(err?.message ?? "Failed to load data")).finally(() => setLoadingDay(false));
  }, [selectedDate]);

  // Reset date and range when sprint changes
  useEffect(() => {
    const r = getInitialRange(sprint);
    setRangeStart(r.start);
    setRangeEnd(r.end);
    setSelectedDate(getDefaultDate(sprint));
  }, [sprint?.id]);

  // Sort: active members first
  const sortedActivity = [...dailyActivity].sort((a, b) => {
    const aCount = a.commits.length;
    const bCount = b.commits.length;
    return bCount - aCount;
  });

  const totalCommits = sortedActivity.reduce((s, a) => s + a.commits.length, 0);
  const activeMembers = sortedActivity.filter((a) => a.commits.length > 0).length;

  const formattedDate = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
  );

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h2 className="text-xl font-bold text-gray-900">Activity</h2>
        <p className="text-sm text-gray-500 mt-1">Daily team activity across the sprint</p>
      </div>

      {/* Calendar strip */}
      {!loadingRange && (
        <CalendarStrip
          startDate={rangeStart}
          endDate={rangeEnd}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          activityCounts={activityCounts}
          sprintLabel={sprint ? sprint.name : undefined}
        />
      )}
      {loadingRange && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 h-20 animate-pulse" />
      )}

      {/* Day header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{formattedDate}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {totalCommits} commit{totalCommits !== 1 ? "s" : ""} by {activeMembers} member{activeMembers !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Member cards */}
      {loadingDay ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedActivity.map((a) => (
            <MemberDayCard
              key={a.member.name}
              config={config}
              name={a.member.name}
              commits={a.commits}
              branches={a.branches}
              tickets={a.tickets}
              ticketSummaries={a.ticketSummaries}
            />
          ))}
          {sortedActivity.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
              <p className="text-gray-500 text-sm">No team members configured.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
