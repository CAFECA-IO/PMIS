import type { SCurvePoint } from "@/service/dashboard.service";

const W = 760;
const H = 190;
const PAD = { left: 34, right: 14, top: 12, bottom: 24 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const COLORS = {
  planned: "#2563eb",
  actual: "#16a34a",
  forecast: "#f59e0b",
};

export function SCurveChart({ points }: { points: SCurvePoint[] }) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        尚無履約事項資料可繪製 S-Curve。
      </p>
    );
  }

  const n = points.length;
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W);
  const y = (v: number) => PAD.top + (1 - v / 100) * PLOT_H;

  const line = (
    getter: (p: SCurvePoint) => number | null,
  ): string =>
    points
      .map((p, i) => ({ v: getter(p), i }))
      .filter((d): d is { v: number; i: number } => d.v !== null)
      .map((d, k) => `${k === 0 ? "M" : "L"} ${x(d.i)} ${y(d.v)}`)
      .join(" ");

  const labelStep = Math.max(1, Math.ceil(n / 8));

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="專案進度 S-Curve"
      >
        {/* y gridlines + labels */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              strokeOpacity={0.12}
            />
            <text
              x={PAD.left - 6}
              y={y(v) + 3}
              textAnchor="end"
              fontSize="10"
              fill="currentColor"
              opacity={0.5}
            >
              {v}
            </text>
          </g>
        ))}

        {/* x labels */}
        {points.map((p, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              opacity={0.5}
            >
              {p.label}
            </text>
          ) : null,
        )}

        {/* series */}
        <path
          d={line((p) => p.planned)}
          fill="none"
          stroke={COLORS.planned}
          strokeWidth={2}
          strokeDasharray="5 4"
        />
        <path
          d={line((p) => p.forecast)}
          fill="none"
          stroke={COLORS.forecast}
          strokeWidth={2}
          strokeDasharray="2 3"
        />
        <path
          d={line((p) => p.actual)}
          fill="none"
          stroke={COLORS.actual}
          strokeWidth={2.5}
        />
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <Legend color={COLORS.planned} label="預定累計 %" dashed />
        <Legend color={COLORS.actual} label="實際累計 %" />
        <Legend color={COLORS.forecast} label="預測趨勢 %" dashed />
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="20" height="8">
        <line
          x1="0"
          y1="4"
          x2="20"
          y2="4"
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}
