/**
 * Info: (20260803 - Julian)
 * 直方圖（已分箱，含選填常態趨勢線）。
 * 分箱由呼叫端提供；常態統計以「分箱序號」為 x、count 為權重計算。
 */
import {
  CHART_COLOR,
  formatValue,
  niceNum,
  scaleLinear,
  type HistogramChartData,
} from "@/components/chart-primitives";

const VIEW_W = 720;
const VIEW_H = 460;
const PLOT_LEFT = 72;
const PLOT_RIGHT = 688;
const PLOT_TOP = 56;
const PLOT_BOTTOM = 384;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT; // 616
const PLOT_H = PLOT_BOTTOM - PLOT_TOP; // 328

const TICK_COUNT = 4;
const SLOT_GAP = 0;
const ROTATE_SLOT_W = 56;
const TREND_SAMPLES = 120;

export function HistogramChart({ data }: { data: HistogramChartData }) {
  const { bins } = data;

  if (bins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">尚無資料可繪製直方圖。</p>
    );
  }

  const counts = bins.map((b) => b.count);

  // 常態統計：以分箱序號為 x、count 為權重（不解析標籤數值）
  const normalStats = (() => {
    if (data.trend !== "normal") return null;
    const total = counts.reduce((s, c) => s + c, 0);
    if (total <= 0) return null;
    const mean = counts.reduce((s, c, i) => s + i * c, 0) / total;
    const variance =
      counts.reduce((s, c, i) => s + c * (i - mean) ** 2, 0) / total;
    const std = Math.sqrt(variance);
    if (std <= 0) return null;
    const peak = total / (std * Math.sqrt(2 * Math.PI));
    return { mean, std, peak };
  })();

  const rawMax = Math.max(1, ...counts, normalStats?.peak ?? 0);
  const step = niceNum(rawMax / TICK_COUNT, true);
  const niceMax = Math.ceil(rawMax / step) * step;
  const toY = scaleLinear(0, niceMax, PLOT_BOTTOM, PLOT_TOP);

  const ticks: number[] = [];
  for (let t = 0; t <= niceMax + step / 2; t += step) ticks.push(t);

  const slotW = PLOT_W / bins.length;
  const barW = Math.max(1, slotW - SLOT_GAP);
  const rotate = slotW < ROTATE_SLOT_W;

  // 常態趨勢線路徑：index 域 [-0.5, n-0.5] 對映繪圖區左右緣
  const trendStroke = data.trendColor ?? CHART_COLOR.accent;
  const trendPath = (() => {
    if (!normalStats) return null;
    const { mean, std, peak } = normalStats;
    const sx = scaleLinear(-0.5, bins.length - 0.5, PLOT_LEFT, PLOT_RIGHT);
    let d = "";
    for (let s = 0; s <= TREND_SAMPLES; s += 1) {
      const frac = s / TREND_SAMPLES;
      const xi = -0.5 + frac * bins.length;
      const c = peak * Math.exp(-((xi - mean) ** 2) / (2 * std * std));
      d += `${s === 0 ? "M" : "L"} ${sx(xi).toFixed(2)} ${toY(c).toFixed(2)}`;
    }
    return d;
  })();

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={data.title ?? "直方圖"}
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

      {/* y 軸刻度 + 格線 */}
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

      {/* 軸線 */}
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

      {/* 分箱長條 + 靜態 count 標籤 + x 標籤 */}
      {bins.map((b, i) => {
        const x = PLOT_LEFT + slotW * i;
        const cx = x + slotW / 2;
        const yTop = toY(b.count);
        const h = Math.max(0, PLOT_BOTTOM - yTop);
        return (
          <g key={b.label}>
            <rect
              x={x}
              y={yTop}
              width={barW}
              height={h}
              fill={CHART_COLOR.foreground}
              fillOpacity={0.85}
              rx={2}
            />
            {b.count > 0 && (
              <text
                x={cx}
                y={yTop - 5}
                textAnchor="middle"
                fontSize={10}
                fill={CHART_COLOR.muted}
              >
                {formatValue(b.count)}
              </text>
            )}
            <text
              x={cx}
              y={PLOT_BOTTOM + (rotate ? 12 : 18)}
              textAnchor={rotate ? "end" : "middle"}
              fontSize={11}
              fill={CHART_COLOR.muted}
              transform={
                rotate ? `rotate(-35 ${cx} ${PLOT_BOTTOM + 12})` : undefined
              }
            >
              {b.label}
            </text>
          </g>
        );
      })}

      {/* 常態趨勢線（單一強調色） */}
      {trendPath && (
        <path
          d={trendPath}
          fill="none"
          stroke={trendStroke}
          strokeWidth={2.5}
        />
      )}

      {/* x 軸標題 */}
      {data.xAxis && (
        <text
          x={PLOT_LEFT + PLOT_W / 2}
          y={VIEW_H - 12}
          textAnchor="middle"
          fontSize={12}
          fill={CHART_COLOR.muted}
        >
          {data.xAxis}
        </text>
      )}

      {/* y 軸標題 */}
      {data.yAxis && (
        <text
          x={20}
          y={PLOT_TOP + PLOT_H / 2}
          textAnchor="middle"
          fontSize={12}
          fill={CHART_COLOR.muted}
          transform={`rotate(-90 20 ${PLOT_TOP + PLOT_H / 2})`}
        >
          {data.yAxis}
        </text>
      )}
    </svg>
  );
}
