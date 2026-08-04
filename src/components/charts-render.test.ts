/**
 * Info: (20260803 - Julian)
 * 四張自訂圖表的渲染 smoke test：
 * 確認 SSR 輸出為合法 SVG、無 NaN/Infinity 幾何、空資料回傳 fallback。
 * 移植驗證用，可長期保留。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MatrixChart } from "./matrix-chart";
import { TornadoChart } from "./tornado-chart";
import { HistogramChart } from "./histogram-chart";
import { BoxPlotChart } from "./box-plot-chart";
import type {
  MatrixChartData,
  TornadoChartData,
  HistogramChartData,
  BoxplotChartData,
} from "./chart-primitives";

function render<T>(Comp: FC<{ data: T }>, data: T): string {
  return renderToStaticMarkup(createElement(Comp, { data }));
}

function assertCleanSvg(markup: string, name: string) {
  assert.ok(markup.includes("<svg"), `${name} 應輸出 <svg>`);
  assert.ok(!/NaN/.test(markup), `${name} 不應含 NaN`);
  assert.ok(!/Infinity/.test(markup), `${name} 不應含 Infinity`);
  assert.ok(!/undefined/.test(markup), `${name} 不應含 undefined 屬性`);
}

const matrix: MatrixChartData = {
  title: "風險矩陣",
  xAxis: { min: "低", max: "高", scale: 5 },
  yAxis: { min: "輕", max: "重", scale: 5 },
  points: [
    { label: "A", x: 3, y: 4, group: "安全" },
    { label: "B", x: 2, y: 3, group: "品質" },
    { label: "C", x: 4.5, y: 2, group: "成本" },
  ],
};

const tornadoCompare: TornadoChartData = {
  title: "預算 vs 實際",
  unit: "萬",
  leftSeries: "預算",
  rightSeries: "實際",
  bars: [
    { category: "結構", left: 4800, right: 4620 },
    { category: "機電", left: 2600, right: 2810 },
  ],
};

const tornadoSensitivity: TornadoChartData = {
  title: "工期敏感度",
  mode: "sensitivity",
  baseline: 540,
  bars: [
    { category: "結構進度", left: 500, right: 590 },
    { category: "天候", left: 520, right: 575 },
  ],
};

const histogram: HistogramChartData = {
  title: "強度分布",
  xAxis: "MPa",
  yAxis: "試體",
  trend: "normal",
  bins: [
    { label: "30–32", count: 14 },
    { label: "32–34", count: 21 },
    { label: "34–36", count: 15 },
  ],
};

const boxplot: BoxplotChartData = {
  title: "壓實度",
  yAxis: "壓實度",
  unit: "%",
  boxes: [
    {
      label: "A",
      min: 92,
      q1: 94.5,
      median: 96,
      q3: 97.5,
      max: 99,
      outliers: [88],
    },
    { label: "B", min: 90, q1: 93, median: 95, q3: 96.5, max: 98 },
  ],
};

test("矩陣圖：正常資料輸出乾淨 SVG", () => {
  assertCleanSvg(render(MatrixChart, matrix), "矩陣圖");
});

test("龍捲風圖（compare）：正常資料輸出乾淨 SVG", () => {
  assertCleanSvg(render(TornadoChart, tornadoCompare), "龍捲風圖-compare");
});

test("龍捲風圖（sensitivity）：正常資料輸出乾淨 SVG", () => {
  assertCleanSvg(
    render(TornadoChart, tornadoSensitivity),
    "龍捲風圖-sensitivity",
  );
});

test("直方圖：含常態趨勢線輸出乾淨 SVG", () => {
  const markup = render(HistogramChart, histogram);
  assertCleanSvg(markup, "直方圖");
  assert.ok(markup.includes("<path"), "直方圖趨勢線應有 <path>");
});

test("箱型圖：含離群點輸出乾淨 SVG", () => {
  const markup = render(BoxPlotChart, boxplot);
  assertCleanSvg(markup, "箱型圖");
  assert.ok(markup.includes("<circle"), "箱型圖離群點應有 <circle>");
});

test("四張圖：空資料皆回傳 fallback 而非爆炸", () => {
  const empties: Array<[string, string]> = [
    [render(MatrixChart, { xAxis: {}, yAxis: {}, points: [] }), "矩陣圖"],
    [render(TornadoChart, { bars: [] }), "龍捲風圖"],
    [render(HistogramChart, { bins: [] }), "直方圖"],
    [render(BoxPlotChart, { boxes: [] }), "箱型圖"],
  ];
  for (const [markup, name] of empties) {
    assert.ok(markup.includes("尚無資料"), `${name} 空資料應顯示 fallback`);
    assert.ok(!markup.includes("<svg"), `${name} 空資料不應繪製 SVG`);
  }
});
