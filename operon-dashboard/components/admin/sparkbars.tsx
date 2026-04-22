'use client';

interface SparkbarsProps {
  data: Array<{ date: string; cents: number; count: number }>;
  height?: number;
}

/**
 * Tiny inline bar chart for daily revenue. No chart library — just SVG.
 * Tooltip is a native <title>; good enough for an ops panel.
 */
export function Sparkbars({ data, height = 120 }: SparkbarsProps) {
  if (data.length === 0) {
    return <div className="text-xs text-t3">No data.</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.cents));
  const barWidth = 100 / data.length;
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      {data.map((d, i) => {
        const h = (d.cents / max) * (height - 8);
        const x = i * barWidth;
        const y = height - h;
        return (
          <g key={d.date}>
            <rect
              x={x + barWidth * 0.1}
              y={y}
              width={barWidth * 0.8}
              height={h}
              fill="var(--color-green)"
              opacity={d.cents > 0 ? 0.75 : 0.2}
            >
              <title>
                {d.date} — ${(d.cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} · {d.count} purchases
              </title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}
