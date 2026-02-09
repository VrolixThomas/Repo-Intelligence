import type { Sprint } from "../types";

interface Props {
  sprints: Sprint[];
  selectedSprintId: number | null;
  onSelect: (sprintId: number | null) => void;
}

const stateColors: Record<string, string> = {
  active: "bg-green-400",
  closed: "bg-gray-400",
  future: "bg-blue-400",
};

export function SprintSelector({ sprints, selectedSprintId, onSelect }: Props) {
  if (sprints.length === 0) return null;

  const selected = sprints.find((s) => s.id === selectedSprintId);

  return (
    <div className="px-4 py-3">
      <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1.5 block">
        Sprint
      </label>
      <select
        value={selectedSprintId ?? ""}
        onChange={(e: any) => {
          const val = e.target.value;
          onSelect(val ? Number(val) : null);
        }}
        className="w-full bg-gray-800 text-white text-sm rounded-lg border border-gray-600 px-3 py-2 focus:outline-none focus:border-blue-400 appearance-none cursor-pointer"
      >
        <option value="">All sprints</option>
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.state})
          </option>
        ))}
      </select>
      {selected && (
        <div className="mt-2 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${stateColors[selected.state] ?? "bg-gray-400"}`} />
          <span className="text-[11px] text-gray-400">
            {selected.startDate && selected.endDate
              ? `${formatShortDate(selected.startDate)} - ${formatShortDate(selected.endDate)}`
              : selected.state === "future"
                ? "Not started"
                : "No dates"
            }
          </span>
        </div>
      )}
    </div>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
