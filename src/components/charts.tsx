/**
 * Small pure-SVG chart primitives for the dashboard (no client JS, no deps).
 */

export function RadialGauge({
  value,
  color = "var(--primary)",
  size = 104,
  stroke = 9,
}: {
  value: number;
  color?: string;
  size?: number;
  stroke?: number;
}) {
  const v = Math.min(100, Math.max(0, value));
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - v / 100);
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.12}
        strokeWidth={stroke}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.18}
        fontWeight={600}
        fill="currentColor"
      >
        {v}%
      </text>
    </svg>
  );
}

/** A progress bar with a target (planned) marker. Red fill when behind. */
export function ProgressWithTarget({
  actual,
  planned,
}: {
  actual: number;
  planned: number;
}) {
  const behind = actual < planned;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-muted">
      <div
        className={
          "h-full rounded-full " + (behind ? "bg-destructive" : "bg-primary")
        }
        style={{ width: `${Math.min(100, Math.max(0, actual))}%` }}
      />
      <div
        className="absolute -top-1 h-[calc(100%+8px)] w-0.5 bg-foreground/60"
        style={{ left: `${Math.min(100, Math.max(0, planned))}%` }}
        title={`預定 ${planned}%`}
      />
    </div>
  );
}

export type BarSegment = { label: string; value: number; color: string };

/**
 * Compact stat rows: small colour dot + label + count + share%.
 * Comparison is by the aligned numbers, so it stays readable without heavy bars.
 */
export function StatRows({ items }: { items: BarSegment[] }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-sm">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: it.color }}
          />
          <span className="text-muted-foreground">{it.label}</span>
          <span className="ml-auto font-semibold tabular-nums">{it.value}</span>
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {total > 0 ? Math.round((it.value / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Horizontal bar list — each category gets its own bar sized relative to the
 * largest value, so magnitudes are directly comparable. Count shown at right.
 */
export function BarList({ items }: { items: BarSegment[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-muted-foreground">{it.label}</span>
          <div className="flex flex-1 items-center gap-2">
            <div className="h-5 flex-1 overflow-hidden rounded bg-muted/60">
              <div
                className="h-full rounded"
                style={{
                  width: `${(it.value / max) * 100}%`,
                  minWidth: it.value > 0 ? 6 : 0,
                  backgroundColor: it.color,
                }}
              />
            </div>
            <span className="w-14 text-right text-sm font-semibold tabular-nums">
              {it.value}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {total > 0 ? `${Math.round((it.value / total) * 100)}%` : ""}
              </span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StackedBar({ segments }: { segments: BarSegment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {total === 0
          ? null
          : segments.map((s) =>
              s.value > 0 ? (
                <div
                  key={s.label}
                  style={{
                    width: `${(s.value / total) * 100}%`,
                    backgroundColor: s.color,
                  }}
                  title={`${s.label}：${s.value}`}
                />
              ) : null,
            )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-medium tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
