/**
 * Info: (20260803 - Julian)
 * 累計進度橫條圖 — 純 SVG、SSR、灰階配色。
 * 長條總長＝累計值；末端以深色區段標示本期增量；可選的預定值以標記線呈現。
 * 用於「各工程項目本月／累計完成」這類需同時看總量與本期貢獻的情境。
 */
import {
  CHART_COLOR,
  formatValue,
  niceNum,
  scaleLinear,
  type ProgressChartData,
} from "@/components/chart-primitives";

const VIEW_W = 720;
const LABEL_W = 150;
const PLOT_LEFT = LABEL_W + 12;
const PLOT_RIGHT = VIEW_W - 72;
const MARGIN_TOP = 56;
const LEGEND_H = 40;
const ROW_H = 40;
const BAR_H = 20;
const TICK_COUNT = 4;
const CHAR_W = 6;
const LABEL_PAD = 4;

export function ProgressBarsChart({ data }: { data: ProgressChartData }) {
  const { items } = data;

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">尚無資料可繪製進度圖。</p>
    );
  }

  const dataMax = Math.max(
    ...items.map((it) => Math.max(it.cumulative, it.planned ?? 0)),
  );
  const step = niceNum((data.scale ?? dataMax) / TICK_COUNT, true);
  const niceMax = Math.max(
    step,
    data.scale ?? Math.ceil(dataMax / step) * step,
  );
  const toX = scaleLinear(0, niceMax, PLOT_LEFT, PLOT_RIGHT);

  const ticks: number[] = [];
  for (let t = 0; t <= niceMax + step / 2; t += step) ticks.push(t);

  const plotBottom = MARGIN_TOP + items.length * ROW_H;
  const viewH = plotBottom + LEGEND_H;
  const hasCurrent = items.some(
    (it) => typeof it.current === "number" && it.current > 0,
  );
  const hasPlanned = items.some((it) => typeof it.planned === "number");
  const unitSuffix = data.unit ?? "";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={data.title ?? "累計進度橫條圖"}
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
            x1={toX(t)}
            x2={toX(t)}
            y1={MARGIN_TOP - 8}
            y2={plotBottom}
            stroke={CHART_COLOR.grid}
          />
          <text
            x={toX(t)}
            y={plotBottom + 16}
            textAnchor="middle"
            fontSize={11}
            fill={CHART_COLOR.muted}
          >
            {`${formatValue(t)}${unitSuffix}`}
          </text>
        </g>
      ))}

      {items.map((it, i) => {
        const y = MARGIN_TOP + i * ROW_H + (ROW_H - BAR_H) / 2;
        const midY = y + BAR_H / 2;
        const cum = Math.max(0, it.cumulative);
        const cur = Math.max(0, Math.min(it.current ?? 0, cum));
        const prior = cum - cur;
        const xPrior = toX(prior);
        const xCum = toX(cum);

        return (
          <g key={`${it.label}-${i}`}>
            <text
              x={LABEL_W}
              y={midY + 4}
              textAnchor="end"
              fontSize={12}
              fill={CHART_COLOR.foreground}
            >
              {it.label}
            </text>

            {prior > 0 && (
              <rect
                x={PLOT_LEFT}
                y={y}
                width={Math.max(0, xPrior - PLOT_LEFT)}
                height={BAR_H}
                fill={CHART_COLOR.muted}
                fillOpacity={0.45}
                rx={2}
              />
            )}
            {cur > 0 && (
              <rect
                x={xPrior}
                y={y}
                width={Math.max(1, xCum - xPrior)}
                height={BAR_H}
                fill={CHART_COLOR.foreground}
                fillOpacity={0.9}
                rx={2}
              />
            )}
            {cum > 0 && cur === 0 && prior === 0 && (
              <rect
                x={PLOT_LEFT}
                y={y}
                width={Math.max(1, xCum - PLOT_LEFT)}
                height={BAR_H}
                fill={CHART_COLOR.muted}
                fillOpacity={0.45}
                rx={2}
              />
            )}

            {typeof it.planned === "number" && (
              <line
                x1={toX(it.planned)}
                x2={toX(it.planned)}
                y1={y - 4}
                y2={y + BAR_H + 4}
                stroke={CHART_COLOR.accent}
                strokeWidth={2}
              />
            )}

            {(() => {
              // Info: (20260803 - Julian) 增量標籤：深色區段夠寬才內嵌，否則併到累計值後面外置，
              // 避免小增量時標籤溢出到前期區段（如 +2 只有約 10px 可用）
              const segW = xCum - xPrior;
              const incLabel = `+${formatValue(cur)}`;
              const fitsInside =
                segW >= incLabel.length * CHAR_W + LABEL_PAD * 2;
              const cumLabel = `${formatValue(cum)}${unitSuffix}`;
              return (
                <>
                  <text
                    x={xCum + 8}
                    y={midY + 4}
                    textAnchor="start"
                    fontSize={11}
                    fill={CHART_COLOR.foreground}
                  >
                    {cur > 0 && !fitsInside
                      ? `${cumLabel}（${incLabel}）`
                      : cumLabel}
                  </text>
                  {cur > 0 && fitsInside && (
                    <text
                      x={xCum - LABEL_PAD}
                      y={midY + 4}
                      textAnchor="end"
                      fontSize={10}
                      fill={CHART_COLOR.contrast}
                    >
                      {incLabel}
                    </text>
                  )}
                </>
              );
            })()}
          </g>
        );
      })}

      <g>
        {[
          hasCurrent
            ? { label: "前期累計", fill: CHART_COLOR.muted, opacity: 0.45 }
            : { label: "累計完成", fill: CHART_COLOR.muted, opacity: 0.45 },
          ...(hasCurrent
            ? [
                {
                  label: "本期增量",
                  fill: CHART_COLOR.foreground,
                  opacity: 0.9,
                },
              ]
            : []),
        ].map((l, i) => {
          const gap = 130;
          const count = hasCurrent ? 2 : 1;
          const total = count * gap + (hasPlanned ? gap : 0);
          const x = VIEW_W / 2 - total / 2 + i * gap;
          const y = viewH - 4;
          return (
            <g key={l.label}>
              <rect
                x={x}
                y={y - 9}
                width={14}
                height={12}
                rx={2}
                fill={l.fill}
                fillOpacity={l.opacity}
              />
              <text x={x + 20} y={y} fontSize={12} fill={CHART_COLOR.muted}>
                {l.label}
              </text>
            </g>
          );
        })}
        {hasPlanned && (
          <g>
            {(() => {
              const gap = 130;
              const count = hasCurrent ? 2 : 1;
              const total = count * gap + gap;
              const x = VIEW_W / 2 - total / 2 + count * gap;
              const y = viewH - 14;
              return (
                <>
                  <line
                    x1={x + 6}
                    x2={x + 6}
                    y1={y - 10}
                    y2={y + 2}
                    stroke={CHART_COLOR.accent}
                    strokeWidth={2}
                  />
                  <text x={x + 20} y={y} fontSize={12} fill={CHART_COLOR.muted}>
                    預定
                  </text>
                </>
              );
            })()}
          </g>
        )}
      </g>
    </svg>
  );
}
