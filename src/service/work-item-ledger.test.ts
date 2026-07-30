import { test } from "node:test";
import assert from "node:assert/strict";

import {
  anomaliesOf,
  anomalyRows,
  groupByWbs,
  isMeasured,
  ledgerRow,
  ledgerRows,
  ledgerTotals,
  multiply,
  percent,
  progressFromQty,
  round,
  valuationStatus,
  type LedgerRowInput,
} from "./work-item-ledger";
import { WBS_CATEGORIES, valuationStatusMeta } from "@/constant/ledger";

/**
 * 以實際台帳畫面的資料為基準。
 *
 * 每一列的契約複價、完成率與估驗狀態都直接對照畫面上的數字 ——
 * 這類算式一旦錯了，錯的是對帳金額，而錯誤本身在畫面上看起來完全正常。
 */
const SHEET: LedgerRowInput[] = [
  {
    id: "1",
    code: "A.01.01",
    name: "水資中心基礎開挖與支撐",
    unit: "m3",
    wbsCode: "WBS-1.1",
    wbsCategory: "civil",
    contractQty: 23_830,
    unitPrice: 1_280,
    completedQty: 8_860,
    inspectedQty: 8_240,
    valuatedQty: 7_800,
  },
  {
    id: "2",
    code: "A.01.02",
    name: "鋼筋混凝土池體",
    unit: "m3",
    wbsCode: "WBS-1.2",
    wbsCategory: "civil",
    contractQty: 12_600,
    unitPrice: 17_800,
    completedQty: 3_150,
    inspectedQty: 2_820,
    valuatedQty: 2_410,
  },
  {
    id: "3",
    code: "A.02.01",
    name: "ϕ600mm 次幹管推進",
    unit: "m",
    wbsCode: "WBS-2.1",
    wbsCategory: "pipeline",
    contractQty: 1_137,
    unitPrice: 28_500,
    completedQty: 318,
    inspectedQty: 286,
    valuatedQty: 254,
  },
  {
    id: "4",
    code: "A.02.02",
    name: "ϕ1350mm 主幹管推進",
    unit: "m",
    wbsCode: "WBS-2.2",
    wbsCategory: "pipeline",
    contractQty: 6_400,
    unitPrice: 96_800,
    completedQty: 620,
    inspectedQty: 510,
    valuatedQty: 430,
  },
  {
    id: "5",
    code: "A.03.01",
    name: "進流抽水設備",
    unit: "組",
    wbsCode: "WBS-3.1",
    wbsCategory: "mechanical",
    contractQty: 6,
    unitPrice: 6_800_000,
    completedQty: 1,
    inspectedQty: 0,
    valuatedQty: 0,
  },
  {
    id: "6",
    code: "A.04.01",
    name: "全廠電氣及儀控系統",
    unit: "式",
    wbsCode: "WBS-4.1",
    wbsCategory: "electrical",
    contractQty: 1,
    unitPrice: 185_000_000,
    completedQty: 0.08,
    inspectedQty: 0.05,
    valuatedQty: 0.03,
  },
  {
    id: "7",
    code: "A.05.01",
    name: "職業安全衛生及環境保護",
    unit: "月",
    wbsCode: "WBS-5.1",
    wbsCategory: "safety",
    contractQty: 42,
    unitPrice: 760_000,
    completedQty: 11,
    inspectedQty: 11,
    valuatedQty: 10,
  },
  {
    id: "8",
    code: "B.01.01",
    name: "工程品質管理及文件作業",
    unit: "式",
    wbsCode: "WBS-0.1",
    wbsCategory: "indirect",
    contractQty: 1,
    unitPrice: 28_500_000,
    completedQty: 0.34,
    inspectedQty: 0.32,
    valuatedQty: 0.29,
  },
];

const byCode = (code: string) => {
  const row = ledgerRows(SHEET).find((r) => r.code === code);
  assert.ok(row, `找不到工項 ${code}`);
  return row;
};

// ── 對照畫面上的每一列 ──────────────────────────────────────
test("契約複價＝契約數量 × 單價，逐列與台帳一致", () => {
  const expected: Record<string, number> = {
    "A.01.01": 30_502_400,
    "A.01.02": 224_280_000,
    "A.02.01": 32_404_500,
    "A.02.02": 619_520_000,
    "A.03.01": 40_800_000,
    "A.04.01": 185_000_000,
    "A.05.01": 31_920_000,
    "B.01.01": 28_500_000,
  };
  for (const [code, amount] of Object.entries(expected)) {
    assert.equal(byCode(code).contractAmount, amount, `${code} 契約複價`);
  }
});

test("完成率＝累計完成 ÷ 契約數量，逐列與台帳一致", () => {
  const expected: Record<string, number> = {
    "A.01.01": 37.2,
    "A.01.02": 25.0,
    "A.02.01": 28.0,
    "A.02.02": 9.7,
    "A.03.01": 16.7,
    "A.04.01": 8.0,
    "A.05.01": 26.2,
    "B.01.01": 34.0,
  };
  for (const [code, rate] of Object.entries(expected)) {
    assert.equal(byCode(code).completionRate, rate, `${code} 完成率`);
  }
});

test("估驗狀態與台帳標示一致", () => {
  assert.equal(byCode("A.01.01").status, "PARTIAL", "查驗多於估驗＝部分估驗");
  assert.equal(byCode("A.01.02").status, "PARTIAL");
  assert.equal(byCode("A.02.01").status, "PARTIAL");
  assert.equal(byCode("A.03.01").status, "PENDING_INSPECTION", "已完成 1 組但尚未查驗");
  assert.equal(byCode("A.04.01").status, "PARTIAL");
  assert.equal(byCode("A.05.01").status, "PARTIAL", "查驗 11 估驗 10，仍有可估驗部分");
  assert.equal(byCode("B.01.01").status, "PARTIAL");
});

test("台帳的狀態文字與畫面用語相同", () => {
  assert.equal(valuationStatusMeta.PARTIAL.label, "部分估驗");
  assert.equal(valuationStatusMeta.PENDING_INSPECTION.label, "待查驗");
  assert.equal(valuationStatusMeta.SETTLED.label, "正常");
});

test("式與組這類非整數單位也算得出金額（0.08 式）", () => {
  const row = byCode("A.04.01");
  assert.equal(row.completedAmount, 14_800_000, "0.08 × 1.85 億");
  assert.equal(row.valuatedAmount, 5_550_000, "0.03 × 1.85 億");
});

// ── 估驗狀態的推導 ──────────────────────────────────────────
test("尚無完成量時為未施作", () => {
  assert.equal(
    valuationStatus({
      contractQty: 10,
      unitPrice: 1,
      completedQty: 0,
      inspectedQty: 0,
      valuatedQty: 0,
    }),
    "NOT_STARTED",
  );
});

test("三個量一致且大於零時為正常", () => {
  assert.equal(
    valuationStatus({
      contractQty: 10,
      unitPrice: 1,
      completedQty: 5,
      inspectedQty: 5,
      valuatedQty: 5,
    }),
    "SETTLED",
  );
});

test("估驗量多於查驗量屬異常，不可混入部分估驗", () => {
  const qty = {
    contractQty: 10,
    unitPrice: 1,
    completedQty: 8,
    inspectedQty: 5,
    valuatedQty: 7,
  };
  assert.equal(valuationStatus(qty), "ANOMALY", "估驗了沒驗過的東西，必須立刻看見");
  assert.match(anomaliesOf(qty).join("｜"), /累計估驗量 7 大於查驗合格量 5/);
});

test("查驗量多於完成量屬異常", () => {
  const qty = {
    contractQty: 10,
    unitPrice: 1,
    completedQty: 3,
    inspectedQty: 5,
    valuatedQty: 0,
  };
  assert.equal(valuationStatus(qty), "ANOMALY");
  assert.match(anomaliesOf(qty).join("｜"), /查驗合格量 5 大於累計完成量 3/);
});

test("完成量超出契約數量屬異常（多做或數量填錯）", () => {
  const qty = {
    contractQty: 10,
    unitPrice: 1,
    completedQty: 12,
    inspectedQty: 10,
    valuatedQty: 10,
  };
  assert.equal(valuationStatus(qty), "ANOMALY");
  assert.match(anomaliesOf(qty).join("｜"), /超出契約數量/);
});

test("契約數量未填時不因完成量而誤判異常", () => {
  const qty = {
    contractQty: null,
    unitPrice: null,
    completedQty: 5,
    inspectedQty: 5,
    valuatedQty: 5,
  };
  assert.equal(valuationStatus(qty), "SETTLED");
  assert.deepEqual(anomaliesOf(qty), []);
});

test("正常的列不帶異常說明", () => {
  for (const code of ["A.01.01", "A.05.01", "B.01.01"]) {
    assert.deepEqual(byCode(code).anomalies, [], `${code} 不該被判為異常`);
  }
});

// ── 未填值的處理 ────────────────────────────────────────────
test("單價未填時金額為 null 而非 0（0 會被當成免費）", () => {
  const row = ledgerRow({
    id: "x",
    code: null,
    name: "未報價工項",
    unit: "m3",
    wbsCode: null,
    wbsCategory: null,
    contractQty: 100,
    unitPrice: null,
    completedQty: 20,
    inspectedQty: 20,
    valuatedQty: 20,
  });
  assert.equal(row.contractAmount, null);
  assert.equal(row.completedAmount, null);
  assert.equal(row.completionRate, 20, "沒有單價仍算得出完成率");
});

test("契約數量為零或未填時完成率為 null 而非 0", () => {
  assert.equal(percent(5, 0), null, "分母為 0 代表資料未填，不是 0%");
  assert.equal(percent(5, null), null);
  assert.equal(percent(null, 10), null);
});

test("未分類的列歸入其他，不會消失", () => {
  const row = ledgerRow({ ...SHEET[0], wbsCategory: null });
  assert.equal(row.categoryLabel, "其他");
});

test("乘法遇未填回 null", () => {
  assert.equal(multiply(null, 10), null);
  assert.equal(multiply(10, null), null);
  assert.equal(multiply(2, 3), 6);
});

test("小數運算不留浮點雜訊", () => {
  assert.equal(round(0.1 + 0.2), 0.3);
  assert.equal(multiply(0.07, 3), 0.21);
});

// ── 合計與彙整 ──────────────────────────────────────────────
test("合計為各列金額之和", () => {
  const totals = ledgerTotals(ledgerRows(SHEET));
  assert.equal(totals.contractAmount, 1_192_926_900);
  assert.equal(totals.rows, 8);
  assert.equal(totals.anomalies, 0);
});

test("整體完成率以金額加權，而非各列百分比平均", () => {
  const totals = ledgerTotals(ledgerRows(SHEET));
  // 各列完成率的算術平均約 23.1%，金額加權後明顯不同
  const naive =
    ledgerRows(SHEET).reduce((s, r) => s + (r.completionRate ?? 0), 0) / 8;
  assert.notEqual(totals.completionRate, round(naive, 1));
  assert.ok(
    totals.completionRate !== null && totals.completionRate < 20,
    `金額加權後應偏低（主幹管佔比高但進度低），實際 ${totals.completionRate}%`,
  );
});

test("依 WBS 類別彙整，順序為台帳慣用排列", () => {
  const groups = groupByWbs(ledgerRows(SHEET), WBS_CATEGORIES);
  assert.deepEqual(
    groups.map((g) => g.label),
    ["土建工程", "管線工程", "機械工程", "電氣儀控", "職安環保", "間接費"],
  );
  const civil = groups[0];
  assert.equal(civil.rows, 2);
  assert.equal(civil.contractAmount, 30_502_400 + 224_280_000);
});

test("彙整不遺漏任何列（未知類別補在最後）", () => {
  const rows = ledgerRows([
    ...SHEET,
    { ...SHEET[0], id: "9", code: "Z.01", wbsCategory: "未來新增的類別" },
  ]);
  const groups = groupByWbs(rows, WBS_CATEGORIES);
  const counted = groups.reduce((s, g) => s + g.rows, 0);
  assert.equal(counted, rows.length, "彙整後的列數必須與原始列數相同");
  assert.equal(groups[groups.length - 1].rows, 1);
});

test("差異異常只列出矛盾的列", () => {
  const rows = ledgerRows([
    ...SHEET,
    {
      ...SHEET[0],
      id: "bad",
      code: "A.09.99",
      completedQty: 100,
      inspectedQty: 200,
      valuatedQty: 300,
    },
  ]);
  const bad = anomalyRows(rows);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].code, "A.09.99");
  assert.equal(bad[0].anomalies.length, 2, "查驗超完成、估驗超查驗兩項都要列出");
});

// ── 與進度欄位的銜接 ────────────────────────────────────────
test("進度由數量推得，取整數", () => {
  assert.equal(progressFromQty(SHEET[0]), 37, "37.2% → 37");
  assert.equal(progressFromQty(SHEET[4]), 17, "16.7% → 17");
});

test("數量不齊時回 null，代表沿用人工填的百分比", () => {
  assert.equal(
    progressFromQty({
      contractQty: null,
      unitPrice: null,
      completedQty: 5,
      inspectedQty: 0,
      valuatedQty: 0,
    }),
    null,
  );
});

test("推得的進度收斂在 0 到 100 之間", () => {
  assert.equal(
    progressFromQty({
      contractQty: 10,
      unitPrice: 1,
      completedQty: 15,
      inspectedQty: 0,
      valuatedQty: 0,
    }),
    100,
    "多做也不會出現 150%",
  );
});

test("有契約數量與單位才算具備計量條件", () => {
  assert.equal(isMeasured({ contractQty: 100, unit: "m3" }), true);
  assert.equal(isMeasured({ contractQty: 100, unit: null }), false);
  assert.equal(isMeasured({ contractQty: null, unit: "m3" }), false);
  assert.equal(isMeasured({ contractQty: 0, unit: "式" }), true, "0 是有效數量");
});
