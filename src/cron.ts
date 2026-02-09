/**
 * Cron scheduling utilities — no external deps.
 * Uses Intl.DateTimeFormat for timezone-aware scheduling.
 */

/**
 * Calculate milliseconds until the next occurrence of the target time in the given timezone.
 */
export function calculateNextRunMs(hour: number, minute: number, timezone: string): number {
  const now = new Date();

  // Get current time components in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  const tzYear = Number(get("year"));
  const tzMonth = Number(get("month"));
  const tzDay = Number(get("day"));
  const tzHour = Number(get("hour"));
  const tzMinute = Number(get("minute"));
  const tzSecond = Number(get("second"));

  // Current time in minutes since midnight (in target timezone)
  const currentMinutes = tzHour * 60 + tzMinute;
  const targetMinutes = hour * 60 + minute;

  let delayMs: number;

  if (currentMinutes < targetMinutes) {
    // Target is later today
    delayMs = (targetMinutes - currentMinutes) * 60_000 - tzSecond * 1000;
  } else {
    // Target is tomorrow
    delayMs = (24 * 60 - currentMinutes + targetMinutes) * 60_000 - tzSecond * 1000;
  }

  // Ensure at least 1 second delay
  if (delayMs < 1000) delayMs += 86_400_000;

  return delayMs;
}

/**
 * Format a delay in ms as a human-readable string like "Next scan at 09:00 (in 14h 23m)"
 */
export function formatNextRun(hour: number, minute: number, delayMs: number): string {
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const totalMinutes = Math.round(delayMs / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  const inStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return `Next scan at ${timeStr} (in ${inStr})`;
}

export interface CronOptions {
  hour: number;
  minute: number;
  timezone: string;
  onScan: () => Promise<void>;
}

/**
 * Run an infinite cron loop: calculate wait -> sleep -> call onScan() -> repeat.
 * Catches errors from onScan() and continues to the next run.
 */
export async function runCronLoop(opts: CronOptions): Promise<never> {
  const { hour, minute, timezone, onScan } = opts;

  console.log(`\n=== CodingSummary Cron Mode ===`);
  console.log(`Schedule: daily at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (${timezone})`);
  console.log(`Press Ctrl+C to stop.\n`);

  while (true) {
    const delayMs = calculateNextRunMs(hour, minute, timezone);
    console.log(formatNextRun(hour, minute, delayMs));

    await Bun.sleep(delayMs);

    const startTime = Date.now();
    console.log(`\n[${new Date().toISOString()}] Starting scheduled scan...`);

    try {
      await onScan();
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`\n[${new Date().toISOString()}] Scan completed in ${durationSec}s`);
    } catch (err: any) {
      console.error(`\n[${new Date().toISOString()}] Scan failed: ${err.message}`);
      console.error(err.stack ?? "");
    }

    console.log();
  }
}
