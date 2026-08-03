/**
 * Info: (20260803 - Julian)
 * 龍捲風圖（雙數列蝴蝶圖 / 敏感度圖）。
 * 兩種模式：compare（左右對稱雙數列）、sensitivity（以基準值切色的水平長條）。
 */
import {
  CHART_COLOR,
  formatValue,
  scaleLinear,
  type TornadoChartData,
} from "@/components/chart-primitives";

const VIEW_W = 720;
const CATEGORY_W = 150; // 左側項目名稱欄
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 44;
const ROW_H = 38;
const BAR_H = 22;

// compare 模式對稱繪圖區
const PLOT_LEFT = CATEGORY_W + 12; // 162
const PLOT_RIGHT = VIEW_W - 60; // 660
const CENTER_X = (PLOT_LEFT + PLOT_RIGHT) / 2; // 411
const HALF_W = (PLOT_RIGHT - PLOT_LEFT) / 2; // 249

// sensitivity 模式絕對值繪圖區
const SENS_PLOT_LEFT = CATEGORY_W + 12; // 162
const SENS_PLOT_RIGHT = VIEW_W - 84; // 636

const CHAR_W = 6.5;
const LABEL_PAD = 4;

export function TornadoChart({ data }: { data: TornadoChartData }) {
  const { bars } = data;

  if (bars.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">尚無資料可繪製龍捲風圖。</p>
    );
  }

  const colorLeft = data.leftColor ?? CHART_COLOR.foreground;
  const colorRight = data.rightColor ?? CHART_COLOR.muted;
  const isSensitivity = data.mode === "sensitivity";

  const plotBottom = MARGIN_TOP + bars.length * ROW_H;

  // ── Sensitivity 模式 ─────────────────────────────────────────
  if (isSensitivity) {
    const sensBars = bars
      .map((b) => ({
        category: b.category,
        lo: Math.min(b.left, b.right),
        hi: Math.max(b.left, b.right),
      }))
      .sort((a, b) => b.hi - b.lo - (a.hi - a.lo));

    const baseline = data.baseline ?? 0;
    const allVals = [...sensBars.flatMap((b) => [b.lo, b.hi]), baseline];
    let dMin = Math.min(...allVals);
    let dMax = Math.max(...allVals);
    const pad = (dMax - dMin || 1) * 0.08;
    dMin -= pad;
    dMax += pad;
    const sx = scaleLinear(dMin, dMax, SENS_PLOT_LEFT, SENS_PLOT_RIGHT);
    const baseX = sx(baseline);
    const hasLegend = data.baseline !== undefined;
    const viewH = plotBottom + (hasLegend ? MARGIN_BOTTOM : 16);

    return (
      <svg
        viewBox={`0 0 ${VIEW_W} ${viewH}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label={data.title ?? "敏感度圖"}
      >
        {data.title && (
          <text
            x={VIEW_W / 2}
            y={28}
            textAnchor="middle"
            fontSize={18}
            fontWeight={700}
            fill={CHART_COLOR.foreground}
          >
            {data.title}
          </text>
        )}
        {data.unit && (
          <text
            x={VIEW_W / 2}
            y={46}
            textAnchor="middle"
            fontSize={11}
            fill={CHART_COLOR.muted}
          >
            單位：{data.unit}
          </text>
        )}

        {/* 基準垂直虛線 */}
        <line
          x1={baseX}
          x2={baseX}
          y1={MARGIN_TOP - 4}
          y2={plotBottom}
          stroke={CHART_COLOR.accent}
          strokeDasharray="4 3"
        />
        <text
          x={baseX}
          y={MARGIN_TOP - 8}
          textAnchor="middle"
          fontSize={10}
          fill={CHART_COLOR.accent}
        >
          基準 {formatValue(baseline)}
        </text>

        {sensBars.map((b, i) => {
          const barY = MARGIN_TOP + i * ROW_H + (ROW_H - BAR_H) / 2;
          const xLo = sx(b.lo);
          const xHi = sx(b.hi);
          const clampBase = Math.min(Math.max(baseX, xLo), xHi);
          return (
            <g key={b.category}>
              {/* 低於基準段 */}
              {clampBase > xLo + 0.5 && (
                <rect
                  x={xLo}
                  y={barY}
                  width={clampBase - xLo}
                  height={BAR_H}
                  fill={colorLeft}
                  fillOpacity={0.85}
                  rx={2}
                />
              )}
              {/* 高於基準段 */}
              {xHi > clampBase + 0.5 && (
                <rect
                  x={clampBase}
                  y={barY}
                  width={xHi - clampBase}
                  height={BAR_H}
                  fill={colorRight}
                  fillOpacity={0.85}
                  rx={2}
                />
              )}
              {/* 項目名 */}
              <text
                x={CATEGORY_W - 8}
                y={barY + BAR_H / 2 + 4}
                textAnchor="end"
                fontSize={11}
                fill={CHART_COLOR.muted}
              >
                {b.category}
              </text>
              {/* lo / hi 端點數值 */}
              <text
                x={xLo - LABEL_PAD}
                y={barY + BAR_H / 2 + 4}
                textAnchor="end"
                fontSize={10}
                fill={CHART_COLOR.muted}
              >
                {formatValue(b.lo)}
              </text>
              <text
                x={xHi + LABEL_PAD}
                y={barY + BAR_H / 2 + 4}
                textAnchor="start"
                fontSize={10}
                fill={CHART_COLOR.muted}
              >
                {formatValue(b.hi)}
              </text>
            </g>
          );
        })}

        {hasLegend && (
          <Legend
            y={viewH - 16}
            items={[
              { color: colorLeft, label: "低於基準" },
              { color: colorRight, label: "高於基準" },
            ]}
          />
        )}
      </svg>
    );
  }

  // ── Compare 模式（預設）───────────────────────────────────────
  const sorted = [...bars].sort(
    (a, b) => b.left + b.right - (a.left + a.right),
  );
  const maxVal = Math.max(0, ...bars.map((b) => Math.max(b.left, b.right)));
  const halfMax = maxVal > 0 ? maxVal * 1.08 : 1;
  const toLen = (v: number) => (Math.max(0, v) / halfMax) * HALF_W;

  const hasLegend = Boolean(data.leftSeries || data.rightSeries);
  const viewH = plotBottom + (hasLegend ? MARGIN_BOTTOM : 16);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={data.title ?? "龍捲風圖"}
    >
      {data.title && (
        <text
          x={VIEW_W / 2}
          y={28}
          textAnchor="middle"
          fontSize={18}
          fontWeight={700}
          fill={CHART_COLOR.foreground}
        >
          {data.title}
        </text>
      )}
      {data.unit && (
        <text
          x={VIEW_W / 2}
          y={46}
          textAnchor="middle"
          fontSize={11}
          fill={CHART_COLOR.muted}
        >
          單位：{data.unit}
        </text>
      )}

      {/* 中心分隔虛線 */}
      <line
        x1={CENTER_X}
        x2={CENTER_X}
        y1={MARGIN_TOP - 4}
        y2={plotBottom}
        stroke={CHART_COLOR.muted}
        strokeDasharray="4 3"
      />

      {sorted.map((b, i) => {
        const barY = MARGIN_TOP + i * ROW_H + (ROW_H - BAR_H) / 2;
        const midY = barY + BAR_H / 2;
        const leftW = toLen(b.left);
        const rightW = toLen(b.right);
        const leftLabel = formatValue(b.left);
        const rightLabel = formatValue(b.right);
        const leftFits = leftW >= leftLabel.length * CHAR_W + LABEL_PAD * 2;
        const rightFits = rightW >= rightLabel.length * CHAR_W + LABEL_PAD * 2;

        return (
          <g key={b.category}>
            {leftW > 0.5 && (
              <rect
                x={CENTER_X - leftW}
                y={barY}
                width={leftW}
                height={BAR_H}
                fill={colorLeft}
                fillOpacity={0.85}
                rx={2}
              />
            )}
            {rightW > 0.5 && (
              <rect
                x={CENTER_X}
                y={barY}
                width={rightW}
                height={BAR_H}
                fill={colorRight}
                fillOpacity={0.85}
                rx={2}
              />
            )}
            {/* 項目名 */}
            <text
              x={CATEGORY_W - 8}
              y={midY + 4}
              textAnchor="end"
              fontSize={11}
              fill={CHART_COLOR.muted}
            >
              {b.category}
            </text>
            {/* 左值：夠寬內嵌（對比色），否則外置（灰） */}
            <text
              x={leftFits ? CENTER_X - LABEL_PAD : CENTER_X - leftW - LABEL_PAD}
              y={midY + 4}
              textAnchor="end"
              fontSize={10}
              fill={leftFits ? CHART_COLOR.contrast : CHART_COLOR.muted}
            >
              {leftLabel}
            </text>
            {/* 右值 */}
            <text
              x={
                rightFits ? CENTER_X + LABEL_PAD : CENTER_X + rightW + LABEL_PAD
              }
              y={midY + 4}
              textAnchor="start"
              fontSize={10}
              fill={rightFits ? CHART_COLOR.contrast : CHART_COLOR.muted}
            >
              {rightLabel}
            </text>
          </g>
        );
      })}

      {hasLegend && (
        <Legend
          y={viewH - 16}
          items={[
            { color: colorLeft, label: data.leftSeries ?? "左" },
            { color: colorRight, label: data.rightSeries ?? "右" },
          ]}
        />
      )}
    </svg>
  );
}

function Legend({
  y,
  items,
}: {
  y: number;
  items: Array<{ color: string; label: string }>;
}) {
  const SWATCH = 12;
  const GAP = 6;
  const ITEM_GAP = 24;
  const CJK_W = 8;
  const widths = items.map((it) => SWATCH + GAP + it.label.length * CJK_W);
  const total =
    widths.reduce((s, w) => s + w, 0) + ITEM_GAP * (items.length - 1);
  const start = VIEW_W / 2 - total / 2;
  // 各項目起始 x（前綴和，避免 render 中可變賦值）
  const offsets = widths.map((_, i) =>
    widths.slice(0, i).reduce((s, w) => s + w + ITEM_GAP, 0),
  );
  return (
    <g>
      {items.map((it, i) => {
        const x = start + offsets[i];
        return (
          <g key={it.label} transform={`translate(${x} ${y})`}>
            <rect
              width={SWATCH}
              height={SWATCH}
              rx={2}
              fill={it.color}
              fillOpacity={0.85}
            />
            <text
              x={SWATCH + GAP}
              y={10}
              fontSize={12}
              fill={CHART_COLOR.muted}
            >
              {it.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
