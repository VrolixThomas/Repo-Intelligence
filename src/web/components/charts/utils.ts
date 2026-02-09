export function scaleLinear(
  domain: [number, number],
  range: [number, number]
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

export function niceMax(value: number): number {
  if (value <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

export function generateTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0];
  const step = Math.ceil(max / count);
  const ticks: number[] = [];
  for (let i = 0; i <= max; i += step) {
    ticks.push(i);
  }
  if (ticks[ticks.length - 1] !== max && ticks.length <= count + 1) {
    ticks.push(max);
  }
  return ticks;
}

export function fillDateGaps<T>(
  sparse: Map<string, T>,
  since: string,
  until: string,
  defaultValue: T
): { date: string; value: T }[] {
  const result: { date: string; value: T }[] = [];
  const startMs = new Date(since).getTime();
  const endMs = new Date(until).getTime();

  for (let ms = startMs; ms <= endMs; ms += 86_400_000) {
    const date = new Date(ms).toISOString().split("T")[0]!;
    result.push({ date, value: sparse.get(date) ?? defaultValue });
  }

  return result;
}

export function formatShortDate(date: string): string {
  const d = new Date(date);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}
