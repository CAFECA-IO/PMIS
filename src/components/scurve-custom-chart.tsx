/**
 * Info: (20260803 - Julian)
 * 進度 S-Curve（預定／實際／預測累計曲線）— 純 SVG、SSR、灰階配色、含圖例。
 * 取代 mermaid xychart-beta：後者 lexer 不支援中文標籤與全形括號。
 * 數值由呼叫端提供，元件不做任何推算。
 */
import {
  CHART_COLOR,
  formatValue,
  niceNum,
  scaleLinear,
  type ScurveChartData,
} from "@/components/chart-primitives";

const VIEW_W = 720;
const VIEW_H = 420;
const PLOT_LEFT = 64;
const PLOT_RIGHT = 688;
const PLOT_TOP = 56;
const PLOT_BOTTOM = 330;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

const TICK_COUNT = 4;
const ROTATE_SLOT_W = 56;

type Series = {
  key: "planned" | "actual" | "forecast";
  label: string;
  dash?: string;
  width: number;
  color: string;
};

const SERIES: Series[] = [
  {
    key: "planned",
    label: "預定累計",
    dash: "5 4",
    width: 2,
    color: CHART_COLOR.muted,
  },
  { key: "actual", label: "實際累計", width: 2.5, color: CHART_COLOR.foreground },
  {
    key: "forecast",
    label: "預測累計",
    dash: "2 3",
    width: 2,
    color: CHART_COLOR.accent,
  },
];

export function ScurveChart({ data }: { data: ScurveChartData }) {
  const { points } = data;

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">尚無資料可繪製 S-Curve。</p>
    );
  }

  const values = points.flatMap((p) =>
    [p.planned, p.actual, p.forecast].filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    ),
  );
  const dataMax = values.length > 0 ? Math.max(...values) : 1;
  const step = niceNum(dataMax / TICK_COUNT, true);
  const niceMax = Math.max(step, Math.ceil(dataMax / step) * step);

  const n = points.length;
  const toX = (i: number) =>
    n <= 1 ? PLOT_LEFT + PLOT_W / 2 : PLOT_LEFT + (i / (n - 1)) * PLOT_W;
  const toY = scaleLinear(0, niceMax, PLOT_BOTTOM, PLOT_TOP);

  const ticks: number[] = [];
  for (let t = 0; t <= niceMax + step / 2; t += step) ticks.push(t);

  const slotW = PLOT_W / Math.max(1, n - 1);
  const rotate = slotW < ROTATE_SLOT_W;
  const labelStep = Math.max(1, Math.ceil(n / 12));

  const linePath = (key: Series["key"]): string =>
    points
      .map((p, i) => ({ v: p[key], i }))
      .filter(
        (d): d is { v: number; i: number } =>
          typeof d.v === "number" && Number.isFinite(d.v),
      )
      .map((d, k) => `${k === 0 ? "M" : "L"} ${toX(d.i).toFixed(2)} ${toY(d.v).toFixed(2)}`)
      .join(" ");

  const shown = SERIES.filter((s) => linePath(s.key) !== "");
  const unitSuffix = data.unit ? ` (${data.unit})` : "";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={data.title ?? "進度 S-Curve"}
    >
      {data.title && (
        <text
          x={VIEW_W / 2}
          y={32}
          textAnchor="middle"
          fontSize={18}
          fontWeight={700}
          fill={CHART_COLOR.foreground}
        >
          {data.title}
        </text>
      )}

      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PLOT_LEFT}
            x2={PLOT_RIGHT}
            y1={toY(t)}
            y2={toY(t)}
            stroke={CHART_COLOR.grid}
          />
          <text
            x={PLOT_LEFT - 8}
            y={toY(t) + 3}
            textAnchor="end"
            fontSize={11}
            fill={CHART_COLOR.muted}
          >
            {formatValue(t)}
          </text>
        </g>
      ))}

      <line
        x1={PLOT_LEFT}
        x2={PLOT_LEFT}
        y1={PLOT_TOP}
        y2={PLOT_BOTTOM}
        stroke={CHART_COLOR.muted}
        strokeWidth={1.5}
      />
      <line
        x1={PLOT_LEFT}
        x2={PLOT_RIGHT}
        y1={PLOT_BOTTOM}
        y2={PLOT_BOTTOM}
        stroke={CHART_COLOR.muted}
        strokeWidth={1.5}
      />

      {points.map((p, i) =>
        i % labelStep === 0 || i === n - 1 ? (
          <text
            key={`${p.label}-${i}`}
            x={toX(i)}
            y={PLOT_BOTTOM + (rotate ? 12 : 18)}
            textAnchor={rotate ? "end" : "middle"}
            fontSize={11}
            fill={CHART_COLOR.muted}
            transform={
              rotate
                ? `rotate(-35 ${toX(i)} ${PLOT_BOTTOM + 12})`
                : undefined
            }
          >
            {p.label}
          </text>
        ) : null,
      )}

      {SERIES.map((s) => {
        const d = linePath(s.key);
        if (!d) return null;
        return (
          <path
            key={s.key}
            d={d}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            strokeDasharray={s.dash}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}

      {SERIES.map((s) => {
        const last = [...points]
          .map((p, i) => ({ v: p[s.key], i }))
          .filter(
            (d): d is { v: number; i: number } =>
              typeof d.v === "number" && Number.isFinite(d.v),
          )
          .pop();
        if (!last) return null;
        return (
          <g key={`end-${s.key}`}>
            <circle
              cx={toX(last.i)}
              cy={toY(last.v)}
              r={4}
              fill={s.color}
              stroke={CHART_COLOR.contrast}
              strokeWidth={2}
            />
            <text
              x={toX(last.i) - 8}
              y={toY(last.v) - 8}
              textAnchor="end"
              fontSize={11}
              fill={s.color}
              stroke={CHART_COLOR.contrast}
              strokeWidth={3}
              paintOrder="stroke"
            >
              {formatValue(last.v)}
            </text>
          </g>
        );
      })}

      {data.yAxis && (
        <text
          x={18}
          y={PLOT_TOP + PLOT_H / 2}
          textAnchor="middle"
          fontSize={12}
          fill={CHART_COLOR.muted}
          transform={`rotate(-90 18 ${PLOT_TOP + PLOT_H / 2})`}
        >
          {`${data.yAxis}${unitSuffix}`}
        </text>
      )}

      {shown.map((s, i) => {
        const gap = 150;
        const total = shown.length * gap;
        const x = VIEW_W / 2 - total / 2 + i * gap;
        const y = VIEW_H - 26;
        return (
          <g key={`legend-${s.key}`}>
            <line
              x1={x}
              x2={x + 26}
              y1={y}
              y2={y}
              stroke={s.color}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
            />
            <text
              x={x + 32}
              y={y + 4}
              fontSize={12}
              fill={CHART_COLOR.muted}
            >
              {s.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
