/**
 * Info: (20260803 - Julian)
 * 矩陣圖（四象限散佈 / 重大性矩陣）。
 * 群組以灰階濃淡階梯區分（取代 isunfa 彩色色盤）；資料點標籤靜態繪製。
 */
import {
  CHART_COLOR,
  clamp,
  grayShade,
  scaleLinear,
  type MatrixChartData,
} from "@/components/chart-primitives";

const VIEW_W = 720;
const VIEW_H = 600;
const PLOT_LEFT = 96;
const PLOT_TOP = 64;
const PLOT_SIZE = 440;
const PLOT_RIGHT = PLOT_LEFT + PLOT_SIZE; // 536
const PLOT_BOTTOM = PLOT_TOP + PLOT_SIZE; // 504
const LEGEND_X = PLOT_RIGHT + 24; // 560

// 象限底色的交替不透明度（Q1..Q4 = 右上/左上/左下/右下）
const QUADRANT_OPACITY = [0.55, 0.3, 0.55, 0.3];

function getDomain(
  values: number[],
  scale?: number,
): { min: number; max: number } {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  if (dataMin < 0) {
    let half = scale ?? Math.max(Math.abs(dataMin), Math.abs(dataMax));
    if (!scale) half *= 1.08;
    return { min: -half, max: half };
  }
  let max = scale ?? dataMax;
  if (!scale) max *= 1.08;
  return { min: 0, max: max || 1 };
}

export function MatrixChart({ data }: { data: MatrixChartData }) {
  const { points } = data;

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">尚無資料可繪製矩陣圖。</p>
    );
  }

  const domainX = getDomain(
    points.map((p) => p.x),
    data.xAxis.scale,
  );
  const domainY = getDomain(
    points.map((p) => p.y),
    data.yAxis.scale,
  );

  const toX = (v: number) =>
    clamp(
      scaleLinear(domainX.min, domainX.max, PLOT_LEFT, PLOT_RIGHT)(v),
      PLOT_LEFT,
      PLOT_RIGHT,
    );
  const toY = (v: number) =>
    clamp(
      scaleLinear(domainY.min, domainY.max, PLOT_BOTTOM, PLOT_TOP)(v),
      PLOT_TOP,
      PLOT_BOTTOM,
    );

  const midX = toX((domainX.min + domainX.max) / 2);
  const midY = toY((domainY.min + domainY.max) / 2);

  // 群組配色：呼叫端自訂色優先，否則取灰階階梯（索引只在未指定色時遞增）
  const groupStyle = new Map<string, { fill: string; opacity: number }>();
  let rampIndex = 0;
  for (const p of points) {
    if (!p.group || groupStyle.has(p.group)) continue;
    const custom = data.groupColors?.[p.group];
    if (custom) {
      groupStyle.set(p.group, { fill: custom, opacity: 1 });
    } else {
      groupStyle.set(p.group, grayShade(rampIndex));
      rampIndex += 1;
    }
  }

  const quadrantFill = (i: number) => ({
    fill: data.quadrantColors?.[i] ?? CHART_COLOR.block,
    opacity: data.quadrantColors?.[i] ? 1 : QUADRANT_OPACITY[i],
  });

  const groups = [...groupStyle.keys()];

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={data.title ?? "矩陣圖"}
    >
      <defs>
        <marker
          id="matrix-arrow"
          viewBox="0 0 10 10"
          refX={8}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={CHART_COLOR.muted} />
        </marker>
      </defs>

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

      {/* 四象限底色 */}
      {[
        {
          x: midX,
          y: PLOT_TOP,
          w: PLOT_RIGHT - midX,
          h: midY - PLOT_TOP,
          q: 0,
        },
        {
          x: PLOT_LEFT,
          y: PLOT_TOP,
          w: midX - PLOT_LEFT,
          h: midY - PLOT_TOP,
          q: 1,
        },
        {
          x: PLOT_LEFT,
          y: midY,
          w: midX - PLOT_LEFT,
          h: PLOT_BOTTOM - midY,
          q: 2,
        },
        { x: midX, y: midY, w: PLOT_RIGHT - midX, h: PLOT_BOTTOM - midY, q: 3 },
      ].map((r) => {
        const f = quadrantFill(r.q);
        return (
          <rect
            key={r.q}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill={f.fill}
            fillOpacity={f.opacity}
          />
        );
      })}

      {/* 中央十字軸（帶箭頭） */}
      <line
        x1={PLOT_LEFT}
        x2={PLOT_RIGHT}
        y1={midY}
        y2={midY}
        stroke={CHART_COLOR.muted}
        strokeWidth={1.5}
        markerEnd="url(#matrix-arrow)"
      />
      <line
        x1={midX}
        x2={midX}
        y1={PLOT_BOTTOM}
        y2={PLOT_TOP}
        stroke={CHART_COLOR.muted}
        strokeWidth={1.5}
        markerEnd="url(#matrix-arrow)"
      />

      {/* X 軸雙極文字 */}
      {data.xAxis.min && (
        <text
          x={PLOT_LEFT}
          y={PLOT_BOTTOM + 28}
          textAnchor="start"
          fontSize={12}
          fontWeight={600}
          fill={CHART_COLOR.muted}
        >
          {data.xAxis.min}
        </text>
      )}
      {data.xAxis.max && (
        <text
          x={PLOT_RIGHT}
          y={PLOT_BOTTOM + 28}
          textAnchor="end"
          fontSize={12}
          fontWeight={600}
          fill={CHART_COLOR.muted}
        >
          {data.xAxis.max}
        </text>
      )}

      {/* Y 軸雙極文字 */}
      {data.yAxis.max && (
        <text
          x={PLOT_LEFT - 16}
          y={PLOT_TOP}
          textAnchor="end"
          fontSize={12}
          fontWeight={600}
          fill={CHART_COLOR.muted}
          transform={`rotate(-90 ${PLOT_LEFT - 16} ${PLOT_TOP})`}
        >
          {data.yAxis.max}
        </text>
      )}
      {data.yAxis.min && (
        <text
          x={PLOT_LEFT - 16}
          y={PLOT_BOTTOM}
          textAnchor="start"
          fontSize={12}
          fontWeight={600}
          fill={CHART_COLOR.muted}
          transform={`rotate(-90 ${PLOT_LEFT - 16} ${PLOT_BOTTOM})`}
        >
          {data.yAxis.min}
        </text>
      )}

      {/* 資料點 + 靜態標籤 */}
      {points.map((p, i) => {
        const cx = toX(p.x);
        const cy = toY(p.y);
        const style = p.group
          ? (groupStyle.get(p.group) ?? { fill: CHART_COLOR.muted, opacity: 1 })
          : { fill: CHART_COLOR.muted, opacity: 1 };
        const onRight = cx > midX;
        return (
          <g key={`${p.label}-${i}`}>
            <circle
              cx={cx}
              cy={cy}
              r={6}
              fill={style.fill}
              fillOpacity={style.opacity}
              stroke={CHART_COLOR.contrast}
              strokeWidth={1.5}
            />
            <text
              x={onRight ? cx - 9 : cx + 9}
              y={cy + 3}
              textAnchor={onRight ? "end" : "start"}
              fontSize={11}
              fill={CHART_COLOR.foreground}
            >
              {p.label}
            </text>
          </g>
        );
      })}

      {/* 群組圖例 */}
      {groups.map((g, i) => {
        const style = groupStyle.get(g)!;
        return (
          <g key={g} transform={`translate(${LEGEND_X} ${PLOT_TOP + i * 22})`}>
            <rect
              width={12}
              height={12}
              rx={2}
              fill={style.fill}
              fillOpacity={style.opacity}
            />
            <text x={18} y={10} fontSize={12} fill={CHART_COLOR.muted}>
              {g}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
