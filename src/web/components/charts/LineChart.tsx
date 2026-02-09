import { useState } from "react";
import { scaleLinear, niceMax, generateTicks, formatShortDate } from "./utils";

interface SeriesData {
  label: string;
  color: string;
  data: { x: number; y: number }[];
}

interface Props {
  series: SeriesData[];
  xLabels: string[];
  yLabel?: string;
  height?: number;
  formatY?: (v: number) => string;
}

const MARGIN = { top: 16, right: 16, bottom: 40, left: 50 };
const WIDTH = 800;

export function LineChart({ series, xLabels, yLabel, height = 240, formatY = String }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const totalW = WIDTH;
  const totalH = height;
  const plotW = totalW - MARGIN.left - MARGIN.right;
  const plotH = totalH - MARGIN.top - MARGIN.bottom;

  // Find Y max
  let yMax = 0;
  for (const s of series) {
    for (const d of s.data) {
      if (d.y > yMax) yMax = d.y;
    }
  }
  yMax = niceMax(yMax);

  const xScale = scaleLinear([0, Math.max(xLabels.length - 1, 1)], [0, plotW]);
  const yScale = scaleLinear([0, yMax], [plotH, 0]);
  const ticks = generateTicks(yMax, 4);

  // Determine which x labels to show
  const labelStep = xLabels.length > 15 ? Math.ceil(xLabels.length / 10) : 1;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        className="w-full"
        style={{ maxHeight: `${totalH}px` }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Gridlines */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} y1={yScale(t)} x2={plotW} y2={yScale(t)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={-8} y={yScale(t) + 4} textAnchor="end" className="fill-gray-400" fontSize={11}>
                {formatY(t)}
              </text>
            </g>
          ))}

          {/* Y axis label */}
          {yLabel && (
            <text
              x={-plotH / 2}
              y={-38}
              transform="rotate(-90)"
              textAnchor="middle"
              className="fill-gray-400"
              fontSize={11}
            >
              {yLabel}
            </text>
          )}

          {/* X axis labels */}
          {xLabels.map((label, i) =>
            i % labelStep === 0 ? (
              <text
                key={i}
                x={xScale(i)}
                y={plotH + 20}
                textAnchor="middle"
                className="fill-gray-400"
                fontSize={10}
              >
                {formatShortDate(label)}
              </text>
            ) : null
          )}

          {/* Series lines */}
          {series.map((s) => {
            if (s.data.length === 0) return null;
            const points = s.data.map((d) => `${xScale(d.x)},${yScale(d.y)}`).join(" ");
            return (
              <g key={s.label}>
                <polyline
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  points={points}
                />
                {/* Dots */}
                {s.data.map((d) => (
                  <circle
                    key={d.x}
                    cx={xScale(d.x)}
                    cy={yScale(d.y)}
                    r={s.data.length > 30 ? 1.5 : 3}
                    fill={s.color}
                  />
                ))}
              </g>
            );
          })}

          {/* Hover overlay */}
          {xLabels.map((_, i) => (
            <rect
              key={i}
              x={xScale(i) - plotW / xLabels.length / 2}
              y={0}
              width={plotW / xLabels.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {/* Hover line */}
          {hoverIndex !== null && (
            <line
              x1={xScale(hoverIndex)}
              y1={0}
              x2={xScale(hoverIndex)}
              y2={plotH}
              stroke="#6b7280"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          )}
        </g>
      </svg>

      {/* Tooltip */}
      {hoverIndex !== null && (
        <div
          className="absolute bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg pointer-events-none z-10"
          style={{
            left: `${((MARGIN.left + xScale(hoverIndex)) / totalW) * 100}%`,
            top: "8px",
            transform: "translateX(-50%)",
          }}
        >
          <div className="font-medium mb-1">{formatShortDate(xLabels[hoverIndex]!)}</div>
          {series.map((s) => {
            const point = s.data.find((d) => d.x === hoverIndex);
            return point ? (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                <span>{s.label}: {formatY(point.y)}</span>
              </div>
            ) : null;
          })}
        </div>
      )}

      {/* Legend */}
      {series.length > 1 && (
        <div className="flex flex-wrap gap-4 mt-2 justify-center">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
