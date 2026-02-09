interface Props {
  startDate: string;
  endDate: string;
}

export function SprintProgressBar({ startDate, endDate }: Props) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const total = end - start;
  const elapsed = now - start;

  if (total <= 0) return null;

  const progress = Math.max(0, Math.min(100, (elapsed / total) * 100));
  const totalDays = Math.ceil(total / 86_400_000);
  const currentDay = Math.min(totalDays, Math.max(1, Math.ceil(elapsed / 86_400_000)));
  const isComplete = now > end;

  return (
    <div>
      <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
            isComplete ? "bg-green-500" : "bg-gradient-to-r from-blue-500 to-blue-400"
          }`}
          style={{ width: `${progress}%` }}
        />
        {!isComplete && progress > 0 && progress < 100 && (
          <div
            className="absolute top-0 w-0.5 h-full bg-blue-700"
            style={{ left: `${progress}%` }}
          />
        )}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[11px] text-gray-500">
          {isComplete ? "Completed" : `Day ${currentDay} of ${totalDays}`}
        </span>
        <span className="text-[11px] text-gray-400">
          {formatDate(startDate)} - {formatDate(endDate)}
        </span>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
