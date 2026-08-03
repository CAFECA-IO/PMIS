/**
 * Info: (20260803 - Julian)
 * 展開器測試：datasetToDsl 產出的 DSL 必須能被 parser 解析成功（序列化↔解析對齊）；
 * expandChartDirectives 對未知 id / 不允許 type 安全降級。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  datasetToDsl,
  expandChartDirectives,
} from "./report-chart-expander";
import type { ReportDataset } from "./report-datasets";
import {
  parseCustomChart,
  detectCustomChartType,
} from "@/lib/custom-chart-parser";
import { CUSTOM_CHART_TYPE } from "@/constant/custom-chart";

const datasets: ReportDataset[] = [
  {
    id: "cmp",
    title: "本期 vs 上期",
    summary: "",
    source: "計數",
    allowedCharts: [CUSTOM_CHART_TYPE.TORNADO],
    data: {
      shape: "paired",
      unit: "件",
      leftName: "上期",
      rightName: "本期",
      rows: [
        { category: "新增缺失", left: 15, right: 12 },
        { category: "查驗", left: 20, right: 24 },
      ],
    },
  },
  {
    id: "mtx",
    title: "缺失矩陣",
    summary: "",
    source: "缺失",
    allowedCharts: [CUSTOM_CHART_TYPE.MATRIX],
    data: {
      shape: "points",
      xAxis: { min: "未逾期", max: "逾期越久" },
      yAxis: { min: "輕微", max: "嚴重", scale: 4 },
      points: [
        { label: "鋼筋外露", x: 13, y: 4, group: "嚴重" },
        { label: "模板滲漿", x: 5, y: 2, group: "中" },
      ],
    },
  },
  {
    id: "hist",
    title: "改善耗時",
    summary: "",
    source: "缺失",
    allowedCharts: [CUSTOM_CHART_TYPE.HISTOGRAM],
    data: {
      shape: "bins",
      xLabel: "天",
      yLabel: "件數",
      trend: "normal",
      bins: [
        { label: "0–3", count: 6 },
        { label: "3–6", count: 4 },
      ],
    },
  },
  {
    id: "box",
    title: "審查天數",
    summary: "",
    source: "送審",
    allowedCharts: [CUSTOM_CHART_TYPE.BOXPLOT],
    data: {
      shape: "boxes",
      yLabel: "天數",
      unit: "天",
      boxes: [
        { label: "設計", min: 2, q1: 4, median: 6, q3: 9, max: 14 },
        {
          label: "材料設備",
          min: 3,
          q1: 5,
          median: 7,
          q3: 11,
          max: 18,
          outliers: [25],
        },
      ],
    },
  },
  {
    id: "wis",
    title: "工項狀態",
    summary: "",
    source: "工項",
    allowedCharts: ["pie"],
    data: {
      shape: "categorical",
      entries: [
        { label: "已完成", value: 8 },
        { label: "施工中", value: 5 },
      ],
    },
  },
];

function firstCustomBlock(md: string): { type: string; inner: string } | null {
  const m = /```(custom-[\w-]+)\n([\s\S]*?)```/.exec(md);
  return m ? { type: m[1], inner: m[2] } : null;
}

test("每個 custom-* 數據集展開的 DSL 都能被 parser 解析成功（round-trip）", () => {
  for (const ds of datasets) {
    const kind = ds.allowedCharts[0];
    if (kind === "pie") continue;
    const dsl = datasetToDsl(ds, kind);
    const block = firstCustomBlock(dsl);
    assert.ok(block, `${ds.id} 應產出 custom-* 圍欄`);
    if (!block) continue;
    const type = detectCustomChartType(block.type);
    assert.ok(type, `${ds.id} fence 語言應可辨識`);
    if (!type) continue;
    const r = parseCustomChart(type, block.inner);
    assert.ok(r.ok, `${ds.id} 展開的 DSL 應可解析：${r.ok ? "" : r.message}`);
  }
});

test("pie 數據集展開為 mermaid 圓餅", () => {
  const pie = datasets.find((d) => d.id === "wis")!;
  const dsl = datasetToDsl(pie, "pie");
  assert.ok(dsl.includes("```mermaid"));
  assert.ok(dsl.includes("pie showData"));
  assert.ok(dsl.includes('"已完成" : 8'));
});

test("expandChartDirectives：合法指令 → 換成 DSL + 來源引用", () => {
  const md = [
    "分析如下。",
    "```pmis-chart",
    "dataset: cmp",
    "type: custom-tornado",
    "```",
    "結論。",
  ].join("\n");
  const out = expandChartDirectives(md, datasets);
  assert.ok(out.includes("```custom-tornado"), "應含展開的 tornado 圍欄");
  assert.ok(out.includes("資料來源"), "應附來源引用");
  assert.ok(!out.includes("pmis-chart"), "原指令應被取代");
});

test("expandChartDirectives：未知 id 與不允許 type → 安全降級", () => {
  const unknown = expandChartDirectives(
    "```pmis-chart\ndataset: nope\ntype: custom-tornado\n```",
    datasets,
  );
  assert.ok(unknown.includes("找不到數據集"));
  assert.ok(!unknown.includes("<svg"));

  const wrongType = expandChartDirectives(
    "```pmis-chart\ndataset: cmp\ntype: custom-matrix\n```",
    datasets,
  );
  assert.ok(wrongType.includes("不支援圖種"));
});
