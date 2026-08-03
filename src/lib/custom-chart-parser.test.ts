/**
 * Info: (20260803 - Julian)
 * 自訂圖表 DSL 解析器單元測試：涵蓋四種圖種、標題列偵測、錯誤碼與邊界。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseCustomChart,
  detectCustomChartType,
} from "./custom-chart-parser";
import {
  CUSTOM_CHART_TYPE,
  CUSTOM_CHART_PARSE_ERROR_CODE,
} from "@/constant/custom-chart";

test("detectCustomChartType：合法 fence → 圖種、其他 → null", () => {
  assert.equal(detectCustomChartType("custom-matrix"), CUSTOM_CHART_TYPE.MATRIX);
  assert.equal(
    detectCustomChartType(" CUSTOM-TORNADO "),
    CUSTOM_CHART_TYPE.TORNADO,
  );
  assert.equal(detectCustomChartType("mermaid"), null);
  assert.equal(detectCustomChartType(""), null);
});

test("矩陣圖：雙極軸、群組色、象限色", () => {
  const dsl = [
    "title: 風險矩陣",
    "xAxis: 低 <-> 高",
    "yAxis: 輕微 <-> 嚴重",
    "xScale: 5",
    "quadrantColors: #FEF9E7, #EEE",
    "邊坡, 3, 4.5, 安全, #123456",
    "腐蝕, 2, 3, 品質",
  ].join("\n");
  const r = parseCustomChart(CUSTOM_CHART_TYPE.MATRIX, dsl);
  if (!r.ok || r.type !== CUSTOM_CHART_TYPE.MATRIX) throw new Error("應為矩陣圖");
  assert.equal(r.data.title, "風險矩陣");
  assert.deepEqual(r.data.xAxis, { scale: 5, min: "低", max: "高" });
  assert.equal(r.data.points.length, 2);
  assert.equal(r.data.points[0].group, "安全");
  assert.equal(r.data.groupColors?.["安全"], "#123456");
  assert.deepEqual(r.data.quadrantColors, ["#FEF9E7", "#EEE"]);
});

test("矩陣圖：欄數不足 → MALFORMED_ROW；壞數字 → INVALID_NUMBER", () => {
  const bad1 = parseCustomChart(CUSTOM_CHART_TYPE.MATRIX, "只有一欄");
  assert.ok(!bad1.ok && bad1.code === CUSTOM_CHART_PARSE_ERROR_CODE.MALFORMED_ROW);
  const bad2 = parseCustomChart(CUSTOM_CHART_TYPE.MATRIX, "A, x, 3");
  assert.ok(!bad2.ok && bad2.code === CUSTOM_CHART_PARSE_ERROR_CODE.INVALID_NUMBER);
});

test("龍捲風（compare）：新式標題列 + 純數字數列名", () => {
  const dsl = [
    "mode: compare",
    "unit: 萬元",
    "2019 <-> 2020",
    "結構, 4800, 4620",
    "機電, 2600, 2810",
  ].join("\n");
  const r = parseCustomChart(CUSTOM_CHART_TYPE.TORNADO, dsl);
  if (!r.ok || r.type !== CUSTOM_CHART_TYPE.TORNADO) {
    throw new Error("應為龍捲風圖");
  }
  assert.equal(r.data.mode, "compare");
  assert.equal(r.data.leftSeries, "2019");
  assert.equal(r.data.rightSeries, "2020");
  assert.equal(r.data.bars.length, 2);
  assert.deepEqual(r.data.bars[0], { category: "結構", left: 4800, right: 4620 });
});

test("龍捲風（sensitivity）：基準值 + 不預排序", () => {
  const dsl = [
    "mode: sensitivity",
    "baseline: 540",
    "結構進度, 500, 590",
    "天候, 520, 575",
  ].join("\n");
  const r = parseCustomChart(CUSTOM_CHART_TYPE.TORNADO, dsl);
  if (!r.ok || r.type !== CUSTOM_CHART_TYPE.TORNADO) {
    throw new Error("應為龍捲風圖");
  }
  assert.equal(r.data.baseline, 540);
  assert.equal(r.data.bars.length, 2);
});

test("龍捲風：標題列分段過多 → MALFORMED_ROW；僅標題列 → NO_DATA_ROWS", () => {
  const bad = parseCustomChart(
    CUSTOM_CHART_TYPE.TORNADO,
    "A <-> B <-> C\n結構, 1, 2",
  );
  assert.ok(!bad.ok && bad.code === CUSTOM_CHART_PARSE_ERROR_CODE.MALFORMED_ROW);
  const onlyHeader = parseCustomChart(CUSTOM_CHART_TYPE.TORNADO, "預算 <-> 實際");
  assert.ok(
    !onlyHeader.ok &&
      onlyHeader.code === CUSTOM_CHART_PARSE_ERROR_CODE.NO_DATA_ROWS,
  );
});

test("直方圖：分箱 + 常態趨勢；未知 trend → MALFORMED_ROW", () => {
  const dsl = [
    "title: 強度分布",
    "trend: normal",
    "%% 這是註解，應被忽略",
    "30-32, 14",
    "32-34, 21",
  ].join("\n");
  const r = parseCustomChart(CUSTOM_CHART_TYPE.HISTOGRAM, dsl);
  if (!r.ok || r.type !== CUSTOM_CHART_TYPE.HISTOGRAM) {
    throw new Error("應為直方圖");
  }
  assert.equal(r.data.trend, "normal");
  assert.equal(r.data.bins.length, 2);
  assert.deepEqual(r.data.bins[1], { label: "32-34", count: 21 });

  const bad = parseCustomChart(CUSTOM_CHART_TYPE.HISTOGRAM, "trend: weird\n0-1, 2");
  assert.ok(!bad.ok && bad.code === CUSTOM_CHART_PARSE_ERROR_CODE.MALFORMED_ROW);
});

test("箱型圖：6 欄與 7 欄（含離群點）", () => {
  const dsl = [
    "title: 壓實度",
    "unit: %",
    "A標, 92, 94.5, 96, 97.5, 99",
    'C標, 91, 94, 95.5, 97, 98.5, "101;87"',
  ].join("\n");
  const r = parseCustomChart(CUSTOM_CHART_TYPE.BOXPLOT, dsl);
  if (!r.ok || r.type !== CUSTOM_CHART_TYPE.BOXPLOT) {
    throw new Error("應為箱型圖");
  }
  assert.equal(r.data.boxes.length, 2);
  assert.equal(r.data.boxes[0].outliers, undefined);
  assert.deepEqual(r.data.boxes[1].outliers, [101, 87]);
});

test("空內容 → EMPTY_CONTENT；無資料列 → NO_DATA_ROWS", () => {
  const empty = parseCustomChart(CUSTOM_CHART_TYPE.MATRIX, "   ");
  assert.ok(!empty.ok && empty.code === CUSTOM_CHART_PARSE_ERROR_CODE.EMPTY_CONTENT);
  const noData = parseCustomChart(CUSTOM_CHART_TYPE.HISTOGRAM, "title: 只有設定");
  assert.ok(!noData.ok && noData.code === CUSTOM_CHART_PARSE_ERROR_CODE.NO_DATA_ROWS);
});
