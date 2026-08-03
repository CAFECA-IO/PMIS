/**
 * Info: (20260803 - Julian)
 * 箱型圖（五數綜合盒鬚圖）。
 * 五數（min/q1/median/q3/max）由呼叫端直接提供，元件不計算四分位。
 */
import {
  CHART_COLOR,
  formatValue,
  niceNum,
  scaleLinear,
  type BoxplotChartData,
} from "@/components/chart-primitives";

const VIEW_W = 720;
const VIEW_H = 460;
const PLOT_LEFT = 72;
const PLOT_RIGHT = 688;
const PLOT_TOP = 56;
const PLOT_BOTTOM = 396;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT; // 616
const PLOT_H = PLOT_BOTTOM - PLOT_TOP; // 340

const TICK_COUNT = 4;
const MAX_BOX_W = 90;
const ROTATE_SLOT_W = 72;

export function BoxPlotChart({ data }: { data: BoxplotChartData }) {
  const { boxes } = data;

  if (boxes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">尚無資料可繪製箱型圖。</p>
    );
  }

  // y 軸域涵蓋所有五數與離群點
  const values = boxes.flatMap((b) => [
    b.min,
    b.q1,
    b.median,
    b.q3,
    b.max,
    ...(b.outliers ?? []),
  ]);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const step = niceNum((dataMax - dataMin) / TICK_COUNT || 1, true);
  const niceMin = Math.floor(dataMin / step) * step;
  const niceMax = Math.ceil(dataMax / step) * step;
  const toY = scaleLinear(niceMin, niceMax, PLOT_BOTTOM, PLOT_TOP);

  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step) ticks.push(t);

  const slotW = PLOT_W / boxes.length;
  const boxW = Math.min(slotW * 0.5, MAX_BOX_W);
  const capW = boxW * 0.5;
  const rotate = slotW < ROTATE_SLOT_W;

  const axisTitle = [data.yAxis, data.unit ? `(${data.unit})` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={data.title ?? "箱型圖"}
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

      {/* y 軸標題 */}
      {axisTitle && (
        <text
          x={20}
          y={PLOT_TOP + PLOT_H / 2}
          textAnchor="middle"
          fontSize={12}
          fill={CHART_COLOR.muted}
          transform={`rotate(-90 20 ${PLOT_TOP + PLOT_H / 2})`}
        >
          {axisTitle}
        </text>
      )}

      {/* 各盒 */}
      {boxes.map((b, i) => {
        const cx = PLOT_LEFT + slotW * (i + 0.5);
        const yMin = toY(b.min);
        const yQ1 = toY(b.q1);
        const yMed = toY(b.median);
        const yQ3 = toY(b.q3);
        const yMax = toY(b.max);
        const boxTop = Math.min(yQ1, yQ3);
        const boxH = Math.max(1, Math.abs(yQ1 - yQ3));

        // 數值標籤靜態放盒身側邊；靠右側的盒放左邊避免出界
        const onRightEdge = cx > PLOT_LEFT + PLOT_W * 0.72;
        const labelX = onRightEdge ? cx - boxW / 2 - 6 : cx + boxW / 2 + 6;
        const labelAnchor = onRightEdge ? "end" : "start";
        const valueRows: Array<{ y: number; v: number }> = [
          { y: yMax, v: b.max },
          { y: yQ3, v: b.q3 },
          { y: yMed, v: b.median },
          { y: yQ1, v: b.q1 },
          { y: yMin, v: b.min },
        ];

        return (
          <g key={b.label}>
            {/* 上鬚線 max→q3、下鬚線 q1→min */}
            <line
              x1={cx}
              x2={cx}
              y1={yMax}
              y2={boxTop}
              stroke={CHART_COLOR.foreground}
              strokeWidth={1.5}
            />
            <line
              x1={cx}
              x2={cx}
              y1={boxTop + boxH}
              y2={yMin}
              stroke={CHART_COLOR.foreground}
              strokeWidth={1.5}
            />
            {/* 端帽 */}
            <line
              x1={cx - capW / 2}
              x2={cx + capW / 2}
              y1={yMax}
              y2={yMax}
              stroke={CHART_COLOR.foreground}
              strokeWidth={1.5}
            />
            <line
              x1={cx - capW / 2}
              x2={cx + capW / 2}
              y1={yMin}
              y2={yMin}
              stroke={CHART_COLOR.foreground}
              strokeWidth={1.5}
            />
            {/* 盒身 q1→q3 */}
            <rect
              x={cx - boxW / 2}
              y={boxTop}
              width={boxW}
              height={boxH}
              fill={CHART_COLOR.foreground}
              fillOpacity={0.85}
              stroke={CHART_COLOR.foreground}
              rx={2}
            />
            {/* 中位數線（對比色） */}
            <line
              x1={cx - boxW / 2}
              x2={cx + boxW / 2}
              y1={yMed}
              y2={yMed}
              stroke={CHART_COLOR.contrast}
              strokeWidth={2.5}
            />
            {/* 離群點 */}
            {(b.outliers ?? []).map((o, k) => (
              <circle
                key={k}
                cx={cx}
                cy={toY(o)}
                r={3}
                fill={CHART_COLOR.muted}
                stroke={CHART_COLOR.contrast}
              />
            ))}
            {/* 靜態五數標籤 */}
            {valueRows.map((row, k) => (
              <text
                key={k}
                x={labelX}
                y={row.y + 3}
                textAnchor={labelAnchor}
                fontSize={9}
                fill={CHART_COLOR.muted}
                stroke={CHART_COLOR.contrast}
                strokeWidth={3}
                paintOrder="stroke"
              >
                {formatValue(row.v)}
              </text>
            ))}
            {/* x 標籤 */}
            <text
              x={cx}
              y={PLOT_BOTTOM + (rotate ? 10 : 18)}
              textAnchor={rotate ? "end" : "middle"}
              fontSize={11}
              fill={CHART_COLOR.muted}
              transform={
                rotate ? `rotate(-35 ${cx} ${PLOT_BOTTOM + 10})` : undefined
              }
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
