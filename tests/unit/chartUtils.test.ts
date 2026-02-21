import { describe, it, expect } from "bun:test";
import { scaleLinear, niceMax, generateTicks, fillDateGaps, formatShortDate } from "../../src/web/components/charts/utils";

describe("scaleLinear", () => {
  it("maps values linearly from domain to range", () => {
    // Arrange
    const scale = scaleLinear([0, 100], [0, 500]);

    // Act & Assert
    expect(scale(0)).toBe(0);
    expect(scale(50)).toBe(250);
    expect(scale(100)).toBe(500);
  });

  it("handles inverted range", () => {
    // Arrange
    // SVG y-axis: higher values → lower pixels
    const scale = scaleLinear([0, 100], [300, 0]);

    // Act & Assert
    expect(scale(0)).toBe(300);
    expect(scale(100)).toBe(0);
    expect(scale(50)).toBe(150);
  });

  it("handles non-zero domain start", () => {
    // Arrange
    const scale = scaleLinear([10, 20], [0, 100]);

    // Act & Assert
    expect(scale(10)).toBe(0);
    expect(scale(15)).toBe(50);
    expect(scale(20)).toBe(100);
  });

  it("handles degenerate domain (d0 === d1) by using span=1 fallback", () => {
    // Arrange
    // When domain is [5, 5], span = 0 || 1 = 1
    const scale = scaleLinear([5, 5], [0, 100]);

    // Act & Assert
    expect(scale(5)).toBe(0);
    expect(scale(6)).toBe(100);
  });

  it("extrapolates beyond domain bounds", () => {
    // Arrange
    const scale = scaleLinear([0, 10], [0, 100]);

    // Act & Assert
    expect(scale(15)).toBe(150);
    expect(scale(-5)).toBe(-50);
  });
});

describe("niceMax", () => {
  it("returns 10 for zero or negative values", () => {
    // Act & Assert
    expect(niceMax(0)).toBe(10);
    expect(niceMax(-5)).toBe(10);
  });

  it("rounds up to the nearest nice number", () => {
    // Act & Assert
    expect(niceMax(7)).toBe(10);
    expect(niceMax(15)).toBe(20);
    expect(niceMax(42)).toBe(50);
    expect(niceMax(85)).toBe(100);
  });

  it("handles small values", () => {
    // Act & Assert
    expect(niceMax(0.3)).toBe(0.5);
    expect(niceMax(0.7)).toBe(1);
    expect(niceMax(1)).toBe(1);
  });

  it("handles exact thresholds", () => {
    // Act & Assert
    expect(niceMax(1)).toBe(1);
    expect(niceMax(2)).toBe(2);
    expect(niceMax(5)).toBe(5);
    expect(niceMax(10)).toBe(10);
  });

  it("handles large values", () => {
    // Act & Assert
    expect(niceMax(1500)).toBe(2000);
    expect(niceMax(55000)).toBe(100000);
  });

  it("handles values just above thresholds", () => {
    // Act & Assert
    expect(niceMax(2.1)).toBe(5);
    expect(niceMax(5.1)).toBe(10);
  });
});

describe("generateTicks", () => {
  it("returns [0] for max <= 0", () => {
    // Act & Assert
    expect(generateTicks(0)).toEqual([0]);
    expect(generateTicks(-10)).toEqual([0]);
  });

  it("generates evenly spaced ticks up to max", () => {
    // Act
    const ticks = generateTicks(100, 5);

    // Assert
    expect(ticks[0]).toBe(0);
    expect(ticks).toContain(100);
    // Step = ceil(100/5) = 20
    expect(ticks).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it("appends max if last tick doesn't land on it", () => {
    // Act
    const ticks = generateTicks(7, 3);

    // Assert
    // Step = ceil(7/3) = 3 → [0, 3, 6, 7]
    expect(ticks).toEqual([0, 3, 6, 7]);
  });

  it("handles max=1 with default count", () => {
    // Act
    const ticks = generateTicks(1);

    // Assert
    // Step = ceil(1/5) = 1 → [0, 1]
    expect(ticks).toEqual([0, 1]);
  });

  it("handles small max with many ticks requested", () => {
    // Act
    const ticks = generateTicks(3, 10);

    // Assert
    // Step = ceil(3/10) = 1 → [0, 1, 2, 3]
    expect(ticks).toEqual([0, 1, 2, 3]);
  });
});

describe("fillDateGaps", () => {
  it("fills missing dates with default value", () => {
    // Arrange
    const sparse = new Map<string, number>();
    sparse.set("2026-02-10", 5);
    sparse.set("2026-02-12", 3);

    // Act
    const result = fillDateGaps(sparse, "2026-02-10", "2026-02-12", 0);

    // Assert
    expect(result).toEqual([
      { date: "2026-02-10", value: 5 },
      { date: "2026-02-11", value: 0 },
      { date: "2026-02-12", value: 3 },
    ]);
  });

  it("returns empty array when since > until", () => {
    // Act & Assert
    const result = fillDateGaps(new Map(), "2026-02-15", "2026-02-10", 0);
    expect(result).toEqual([]);
  });

  it("handles single-day range", () => {
    // Arrange
    const sparse = new Map([["2026-02-10", 42]]);

    // Act
    const result = fillDateGaps(sparse, "2026-02-10", "2026-02-10", 0);

    // Assert
    expect(result).toEqual([{ date: "2026-02-10", value: 42 }]);
  });

  it("uses default value for all missing dates", () => {
    // Act
    const result = fillDateGaps(new Map(), "2026-02-10", "2026-02-12", 99);

    // Assert
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.value === 99)).toBe(true);
  });

  it("handles month boundary", () => {
    // Act
    const result = fillDateGaps(new Map(), "2026-01-30", "2026-02-02", 0);

    // Assert
    const dates = result.map((r) => r.date);
    expect(dates).toContain("2026-01-30");
    expect(dates).toContain("2026-01-31");
    expect(dates).toContain("2026-02-01");
    expect(dates).toContain("2026-02-02");
    expect(result).toHaveLength(4);
  });
});

describe("formatShortDate", () => {
  it("formats ISO date as 'Mon DD'", () => {
    // Act & Assert
    expect(formatShortDate("2026-02-15")).toBe("Feb 15");
  });

  it("formats different months", () => {
    // Act & Assert
    expect(formatShortDate("2026-01-01")).toBe("Jan 1");
    expect(formatShortDate("2026-06-30")).toBe("Jun 30");
    expect(formatShortDate("2026-12-25")).toBe("Dec 25");
  });

  it("handles full ISO datetime", () => {
    // Act & Assert
    expect(formatShortDate("2026-02-15T10:30:00Z")).toBe("Feb 15");
  });
});
