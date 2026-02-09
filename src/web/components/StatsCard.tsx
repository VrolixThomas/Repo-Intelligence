interface Props {
  label: string;
  value: string | number;
  color?: "blue" | "green" | "purple" | "amber";
}

const colorMap = {
  blue: "border-blue-500 bg-blue-50 text-blue-700",
  green: "border-green-500 bg-green-50 text-green-700",
  purple: "border-purple-500 bg-purple-50 text-purple-700",
  amber: "border-amber-500 bg-amber-50 text-amber-700",
};

export function StatsCard({ label, value, color = "blue" }: Props) {
  return (
    <div className={`rounded-lg border-l-4 p-4 bg-white shadow-sm ${colorMap[color]}`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
