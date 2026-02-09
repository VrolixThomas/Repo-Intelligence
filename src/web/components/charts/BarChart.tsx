import { useState } from "react";
import { scaleLinear, niceMax, generateTicks, formatShortDate } from "./utils";

interface StackData {
  label: string;
  color: string;
  values: number[];
}

interface Props {
  stacks: StackData[];
  xLabels: string[];
  yLabel?: string;
  height?: number;
  stacked?: boolean;
  formatY?: (v: number) => string;
}

const MARGIN = { top: 16, right: 16, bottom: 40, left: 50 };
const WIDTH = 800;

export function BarChart({ stacks, xLabels, yLabel, height = 240, stacked = true, formatY = String }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const totalW = WIDTH;
  const totalH = height;
  const plotW = totalW - MARGIN.left - MARGIN.right;
  const plotH = totalH - MARGIN.top - MARGIN.bottom;

  // Find Y max
  let yMax = 0;
  if (stacked) {
    for (let i = 0; i < xLabels.length; i++) {
      let sum = 0;
      for (const s of stacks) {
        sum += s.values[i] ?? 0;
      }
      if (sum > yMax) yMax = sum;
    }
  } else {
    for (const s of stacks) {
      for (const v of s.values) {
        if (v > yMax) yMax = v;
      }
    }
  }
  yMax = niceMax(yMax);

  const xScale = scaleLinear([0, Math.max(xLabels.length - 1, 1)], [0, plotW]);
  const yScale = scaleLinear([0, yMax], [plotH, 0]);
  const ticks = generateTicks(yMax, 4);

  const barWidth = Math.max(2, (plotW / xLabels.length) * 0.6);
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

          {/* Bars */}
          {xLabels.map((_, i) => {
            if (stacked) {
              let cumY = 0;
              return (
                <g key={i}>
                  {stacks.map((s) => {
                    const val = s.values[i] ?? 0;
                    const barH = plotH - yScale(val);
                    const y = yScale(cumY + val);
                    cumY += val;
                    return (
                      <rect
                        key={s.label}
                        x={xScale(i) - barWidth / 2}
                        y={y}
                        width={barWidth}
                        height={Math.max(0, barH)}
                        fill={s.color}
                        opacity={hoverIndex === i ? 1 : 0.85}
                      />
                    );
                  })}
                </g>
              );
            } else {
              const groupW = barWidth;
              const singleW = groupW / stacks.length;
              return (
                <g key={i}>
                  {stacks.map((s, si) => {
                    const val = s.values[i] ?? 0;
                    const barH = plotH - yScale(val);
                    return (
                      <rect
                        key={s.label}
                        x={xScale(i) - groupW / 2 + si * singleW}
                        y={yScale(val)}
                        width={singleW * 0.9}
                        height={Math.max(0, barH)}
                        fill={s.color}
                        opacity={hoverIndex === i ? 1 : 0.85}
                      />
                    );
                  })}
                </g>
              );
            }
          })}

          {/* Hover overlay */}
          {xLabels.map((_, i) => (
            <rect
              key={`hover-${i}`}
              x={xScale(i) - plotW / xLabels.length / 2}
              y={0}
              width={plotW / xLabels.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}
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
          {stacks.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
              <span>{s.label}: {formatY(s.values[hoverIndex] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {stacks.length > 1 && (
        <div className="flex flex-wrap gap-4 mt-2 justify-center">
          {stacks.map((s) => (
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
