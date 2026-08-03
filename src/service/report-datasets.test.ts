/**
 * Info: (20260803 - Julian)
 * 白名單數據集純邏輯測試：分位數、Tukey 五數綜合、決定論分箱、以及 assembleDatasets 產出。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  quantile,
  fiveNumberSummary,
  binValues,
  diffDays,
  assembleDatasets,
  type ReportDatasetInput,
} from "./report-datasets";

test("quantile：type-7 線性內插", () => {
  const s = [1, 2, 3, 4];
  assert.equal(quantile(s, 0.5), 2.5);
  assert.equal(quantile(s, 0.25), 1.75);
  assert.equal(quantile(s, 0.75), 3.25);
  assert.equal(quantile([5], 0.5), 5);
});

test("fiveNumberSummary：Tukey 1.5×IQR 離群、鬚線止於界內極值", () => {
  const r = fiveNumberSummary([1, 2, 3, 4, 5, 100]);
  assert.ok(r.outliers.includes(100), "100 應為離群點");
  assert.equal(r.max, 5, "鬚線上緣應止於界內最大值 5");
  assert.equal(r.min, 1);
  assert.ok(r.median > 0);
});

test("binValues：分箱涵蓋全部值、count 總和守恆", () => {
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const bins = binValues(values);
  assert.ok(bins.length >= 2, "應分多箱");
  const total = bins.reduce((s, b) => s + b.count, 0);
  assert.equal(total, values.length, "count 總和應等於資料筆數");
});

test("binValues：全部相同值 → 單箱", () => {
  const bins = binValues([3, 3, 3]);
  assert.equal(bins.length, 1);
  assert.equal(bins[0].count, 3);
});

test("diffDays：無條件捨去、最小 0", () => {
  assert.equal(diffDays(new Date("2026-07-20"), new Date("2026-08-02")), 13);
  assert.equal(diffDays(new Date("2026-08-02"), new Date("2026-07-20")), 0);
});

const fullInput: ReportDatasetInput = {
  workItemStatus: [
    { label: "已完成", value: 8 },
    { label: "施工中", value: 5 },
  ],
  inspectionResult: [{ label: "合格", value: 20 }],
  periodCompare: {
    prevLabel: "上期",
    curLabel: "本期",
    rows: [
      { category: "新增缺失", prev: 15, cur: 12 },
      { category: "查驗", prev: 20, cur: 24 },
    ],
  },
  openDefects: [
    { title: "鋼筋外露", severity: "CRITICAL", dueDate: new Date("2026-07-20") },
    { title: "無期限", severity: "LOW", dueDate: null },
  ],
  now: new Date("2026-08-02"),
  resolutionDays: [1, 2, 3, 4, 5, 6],
  reviewDaysByCategory: [{ category: "設計", days: [2, 4, 6, 9, 14] }],
};

test("assembleDatasets：產出預期 id、矩陣跳過無期限缺失", () => {
  const ds = assembleDatasets(fullInput);
  const ids = ds.map((d) => d.id);
  assert.deepEqual(ids, [
    "work_item_status",
    "inspection_result",
    "defects_period_compare",
    "open_defect_matrix",
    "defect_resolution_histogram",
    "submittal_review_boxplot",
  ]);
  const matrix = ds.find((d) => d.id === "open_defect_matrix");
  assert.ok(matrix && matrix.data.shape === "points");
  if (matrix && matrix.data.shape === "points") {
    assert.equal(matrix.data.points.length, 1, "無期限缺失應被略過");
    assert.equal(matrix.data.points[0].x, 13, "逾期天數 = now − dueDate");
    assert.equal(matrix.data.points[0].y, 4, "CRITICAL → 序數 4");
  }
});

test("assembleDatasets：空輸入 → 不產出任何數據集（不硬湊）", () => {
  const ds = assembleDatasets({
    workItemStatus: [],
    inspectionResult: [],
    periodCompare: { prevLabel: "上期", curLabel: "本期", rows: [] },
    openDefects: [],
    now: new Date(),
    resolutionDays: [],
    reviewDaysByCategory: [],
  });
  assert.equal(ds.length, 0);
});
