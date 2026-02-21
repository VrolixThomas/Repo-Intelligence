import { describe, it, expect, setSystemTime, afterEach } from "bun:test";
import { calculateNextRunMs, formatNextRun } from "../../src/cron";

describe("calculateNextRunMs", () => {
  afterEach(() => {
    setSystemTime(); // restore real time
  });

  it("schedules later today when target is in the future", () => {
    // Arrange
    // Fix time to 08:00:00 UTC on 2026-02-15
    setSystemTime(new Date("2026-02-15T08:00:00Z"));

    // Act
    // Target: 09:00 UTC → exactly 1 hour from now
    const ms = calculateNextRunMs(9, 0, "UTC");

    // Assert
    const oneHourMs = 60 * 60 * 1000;
    expect(ms).toBe(oneHourMs);
  });

  it("schedules tomorrow when target has already passed today", () => {
    // Arrange
    // Fix time to 10:30:00 UTC
    setSystemTime(new Date("2026-02-15T10:30:00Z"));

    // Act
    // Target: 09:00 UTC → should be 22h 30m from now
    const ms = calculateNextRunMs(9, 0, "UTC");

    // Assert
    const expectedMs = (22 * 60 + 30) * 60_000;
    expect(ms).toBe(expectedMs);
  });

  it("schedules tomorrow when target is at the same minute (minimum guard)", () => {
    // Arrange
    // Fix time to 09:00:30 UTC (30s past the target minute)
    setSystemTime(new Date("2026-02-15T09:00:30Z"));

    // Act
    // Target: 09:00 UTC → currentMinutes == targetMinutes
    // Formula: (24*60 - 540 + 540) * 60_000 - 30*1000 = 86_400_000 - 30_000
    // Then since that's > 1000, no guard addition needed
    const ms = calculateNextRunMs(9, 0, "UTC");

    // Assert
    const expectedMs = 24 * 60 * 60_000 - 30_000;
    expect(ms).toBe(expectedMs);
  });

  it("accounts for seconds in the delay calculation", () => {
    // Arrange
    // Fix time to 08:00:45 UTC
    setSystemTime(new Date("2026-02-15T08:00:45Z"));

    // Act
    // Target: 09:00 UTC → 1h minus 45s = 3600_000 - 45_000 = 3_555_000
    const ms = calculateNextRunMs(9, 0, "UTC");

    // Assert
    expect(ms).toBe(60 * 60_000 - 45_000);
  });

  it("returns at least 1 second (minimum guard triggers)", () => {
    // Arrange
    // Fix time to 08:59:59 UTC → 1s before 09:00
    setSystemTime(new Date("2026-02-15T08:59:59Z"));

    // Act
    const ms = calculateNextRunMs(9, 0, "UTC");

    // Assert
    // (540 - 539) * 60_000 - 59*1000 = 60_000 - 59_000 = 1_000
    expect(ms).toBe(1_000);
  });

  it("adds 24h when computed delay is under 1 second", () => {
    // Arrange
    // Fix time to 09:00:00.500 UTC → the second counter says 0s
    // But (540 - 540) takes the else branch → (24*60) * 60_000 - 0*1000
    // Actually if exactly at 09:00:00, tzSecond = 0, currentMinutes = targetMinutes
    // Goes to else: (1440 - 540 + 540) * 60_000 - 0 = 86_400_000
    // 86_400_000 >= 1000, so no guard needed
    setSystemTime(new Date("2026-02-15T09:00:00Z"));

    // Act
    const ms = calculateNextRunMs(9, 0, "UTC");

    // Assert
    expect(ms).toBe(86_400_000);
  });

  it("handles timezone offset correctly", () => {
    // Arrange
    // Fix time to 07:00:00 UTC → 08:00:00 in Europe/Brussels (UTC+1 in Feb)
    setSystemTime(new Date("2026-02-15T07:00:00Z"));

    // Act
    // Target: 09:00 in Brussels timezone → 1 hour from now (Brussels is 08:00)
    const ms = calculateNextRunMs(9, 0, "Europe/Brussels");

    // Assert
    const oneHourMs = 60 * 60_000;
    expect(ms).toBe(oneHourMs);
  });

  it("works with different timezones without throwing", () => {
    // Arrange
    setSystemTime(new Date("2026-02-15T12:00:00Z"));

    // Act & Assert
    expect(() => calculateNextRunMs(12, 0, "UTC")).not.toThrow();
    expect(() => calculateNextRunMs(12, 0, "Asia/Tokyo")).not.toThrow();
    expect(() => calculateNextRunMs(12, 0, "America/New_York")).not.toThrow();
    expect(() => calculateNextRunMs(12, 0, "Europe/Brussels")).not.toThrow();
  });

  it("handles minute-level target precision", () => {
    // Arrange
    setSystemTime(new Date("2026-02-15T08:00:00Z"));

    // Act
    // Target: 09:30 → 1h 30m from now
    const ms = calculateNextRunMs(9, 30, "UTC");

    // Assert
    expect(ms).toBe(90 * 60_000);
  });
});

describe("formatNextRun", () => {
  it("formats time and delay with hours and minutes", () => {
    // Arrange
    const delayMs = (14 * 60 + 23) * 60_000; // 14h 23m

    // Act & Assert
    expect(formatNextRun(9, 0, delayMs)).toBe("Next scan at 09:00 (in 14h 23m)");
  });

  it("formats delay with only minutes when less than 1 hour", () => {
    // Arrange
    const delayMs = 45 * 60_000;

    // Act & Assert
    expect(formatNextRun(9, 30, delayMs)).toBe("Next scan at 09:30 (in 45m)");
  });

  it("pads single-digit hours and minutes", () => {
    // Act & Assert
    expect(formatNextRun(5, 3, 60_000)).toContain("05:03");
  });

  it("handles zero delay", () => {
    // Act & Assert
    expect(formatNextRun(12, 0, 0)).toBe("Next scan at 12:00 (in 0m)");
  });

  it("handles exactly 1 hour", () => {
    // Act & Assert
    expect(formatNextRun(10, 0, 60 * 60_000)).toBe("Next scan at 10:00 (in 1h 0m)");
  });

  it("handles 23h 59m", () => {
    // Arrange
    const delayMs = (23 * 60 + 59) * 60_000;

    // Act & Assert
    expect(formatNextRun(9, 0, delayMs)).toBe("Next scan at 09:00 (in 23h 59m)");
  });
});
