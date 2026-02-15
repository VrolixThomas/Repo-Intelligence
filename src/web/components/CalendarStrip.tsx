import { useRef, useEffect } from "react";

interface Props {
  startDate: string;
  endDate: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  activityCounts: Map<string, number>;
  sprintLabel?: string;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function heatColor(count: number): string {
  if (count === 0) return "bg-gray-200";
  if (count <= 3) return "bg-green-300";
  if (count <= 7) return "bg-green-500";
  return "bg-green-700";
}

export function CalendarStrip({
  startDate,
  endDate,
  selectedDate,
  onSelectDate,
  activityCounts,
  sprintLabel,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Generate all dates in range
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().split("T")[0]!);
    cursor.setDate(cursor.getDate() + 1);
  }

  const today = new Date().toISOString().split("T")[0]!;

  // Auto-scroll to selected date on mount
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedDate]);

  const navigateDay = (offset: number) => {
    const idx = dates.indexOf(selectedDate);
    if (idx >= 0) {
      const newIdx = idx + offset;
      if (newIdx >= 0 && newIdx < dates.length) {
        onSelectDate(dates[newIdx]!);
        return;
      }
    }
    // Navigate beyond visible range — compute the date mathematically
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    onSelectDate(d.toISOString().split("T")[0]!);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      {sprintLabel && (
        <p className="text-xs text-gray-500 mb-2">{sprintLabel}</p>
      )}
      <div className="flex items-center gap-2">
        {/* Left arrow — previous day */}
        <button
          onClick={() => navigateDay(-1)}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors bg-gray-100 hover:bg-gray-200 text-gray-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Scrollable date cells */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto flex gap-1.5 scrollbar-hide"
          style={{ scrollbarWidth: "none" }}
        >
          {dates.map((date) => {
            const d = new Date(date + "T12:00:00");
            const dayNum = d.getDate();
            const dayName = DAY_NAMES[d.getDay()]!;
            const isSelected = date === selectedDate;
            const isToday = date === today;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const count = activityCounts.get(date) ?? 0;

            return (
              <button
                key={date}
                ref={isSelected ? selectedRef : undefined}
                onClick={() => onSelectDate(date)}
                className={`shrink-0 w-[52px] flex flex-col items-center gap-1 py-2 px-1 rounded-lg transition-all ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-sm"
                    : isToday
                      ? "bg-white ring-2 ring-blue-400 text-gray-900"
                      : isWeekend
                        ? "bg-gray-50 text-gray-400 hover:bg-gray-100"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className={`text-[10px] font-medium ${isSelected ? "text-blue-100" : isWeekend ? "text-gray-400" : "text-gray-500"}`}>
                  {dayName}
                </span>
                <span className={`text-sm font-semibold ${isSelected ? "text-white" : ""}`}>
                  {dayNum}
                </span>
                <span className={`w-2 h-2 rounded-full ${
                  isSelected ? (count > 0 ? "bg-white" : "bg-blue-400") : heatColor(count)
                }`} />
              </button>
            );
          })}
        </div>

        {/* Right arrow — next day */}
        <button
          onClick={() => navigateDay(1)}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors bg-gray-100 hover:bg-gray-200 text-gray-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
