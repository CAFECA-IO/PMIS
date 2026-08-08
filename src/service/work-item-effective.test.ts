import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dailyQtyTotals,
  excludeOwnDailyQty,
  effectiveCompletedQty,
  effectiveProgress,
  withEffectiveProgress,
  withEffectiveProgressAll,
  withEffectiveQty,
  withEffectiveQtyAll,
} from "./work-item-effective";
import { ledgerRow, type LedgerQty } from "@/service/work-item-ledger";

/** 一列已計量工項：契約 1000、單價 500、期初完成 200。 */
const MEASURED: LedgerQty = {
  contractQty: 1000,
  unitPrice: 500,
  completedQty: 200,
  inspectedQty: 150,
  valuatedQty: 100,
};

/** 一列未計量工項：無契約數量，僅靠人工填報進度。 */
const UNMEASURED: LedgerQty = {
  contractQty: null,
  unitPrice: null,
  completedQty: null,
  inspectedQty: null,
  valuatedQty: null,
};

// ── dailyQtyTotals ──────────────────────────────────────────

test("dailyQtyTotals 整理分組加總", () => {
  const m = dailyQtyTotals([
    { workItemId: "a", total: 30 },
    { workItemId: "b", total: 5.5 },
  ]);
  assert.equal(m.get("a"), 30);
  assert.equal(m.get("b"), 5.5);
  assert.equal(m.size, 2);
});

test("dailyQtyTotals 排除契約外臨時項目（workItemId 為 null）", () => {
  const m = dailyQtyTotals([
    { workItemId: null, total: 999 },
    { workItemId: "a", total: 10 },
  ]);
  assert.equal(m.size, 1, "null 工項不得計入任何工項");
  assert.equal(m.get("a"), 10);
});

test("dailyQtyTotals 丟棄 null 與非有限數的 total", () => {
  const m = dailyQtyTotals([
    { workItemId: "a", total: null },
    { workItemId: "b", total: Number.NaN },
    { workItemId: "c", total: 7 },
  ]);
  assert.equal(m.has("a"), false);
  assert.equal(m.has("b"), false);
  assert.equal(m.get("c"), 7);
});

test("dailyQtyTotals 對重複 workItemId 累加而非覆蓋", () => {
  const m = dailyQtyTotals([
    { workItemId: "a", total: 10 },
    { workItemId: "a", total: 4 },
  ]);
  assert.equal(m.get("a"), 14, "不得靜默丟棄其中一筆");
});

test("dailyQtyTotals 對空輸入回空 Map", () => {
  assert.equal(dailyQtyTotals([]).size, 0);
});

// ── excludeOwnDailyQty ──────────────────────────────────────

test("excludeOwnDailyQty 扣掉正在編輯那份日報自己的量", () => {
  // 期初 0、8/1 已提送日報填了 30 → 全期間加總含這 30。
  // 重新開啟編輯時「目前累計」必須是 0，否則畫面上的
  // 「填報後累計 = 目前累計 + 本日 30」會顯示 60，而實際存檔後仍是 30。
  const m = excludeOwnDailyQty(
    new Map([
      ["a", 30],
      ["b", 80],
    ]),
    new Map([["a", 30]]),
  );
  assert.equal(m.get("a"), 0);
  assert.equal(m.get("b"), 80, "其他工項不受影響");
});

test("excludeOwnDailyQty 只扣部分時保留其餘累計", () => {
  const m = excludeOwnDailyQty(new Map([["a", 100]]), new Map([["a", 30]]));
  assert.equal(m.get("a"), 70);
});

test("excludeOwnDailyQty 不建立加總中不存在的工項", () => {
  // 草稿日報的量本來就不在加總裡（決策 G），不該因為扣減而憑空冒出一列
  const m = excludeOwnDailyQty(new Map([["a", 10]]), new Map([["z", 5]]));
  assert.equal(m.has("z"), false);
  assert.equal(m.get("a"), 10);
});

test("excludeOwnDailyQty 夾在 0 以上", () => {
  const m = excludeOwnDailyQty(new Map([["a", 10]]), new Map([["a", 25]]));
  assert.equal(m.get("a"), 0, "負累計只會讓人更困惑");
});

test("excludeOwnDailyQty 忽略非有限數且不改動傳入的 Map", () => {
  const totals = new Map([["a", 10]]);
  const out = excludeOwnDailyQty(totals, new Map([["a", Number.NaN]]));
  assert.equal(out.get("a"), 10);
  assert.equal(totals.get("a"), 10, "原 Map 不應被就地修改");
  assert.notEqual(out, totals);
});

// ── effectiveCompletedQty ───────────────────────────────────

test("effectiveCompletedQty 期初與日報相加", () => {
  assert.equal(effectiveCompletedQty(200, 55), 255);
});

test("effectiveCompletedQty 僅有其中一邊時以該邊為值", () => {
  assert.equal(effectiveCompletedQty(200, null), 200, "日報尚無紀錄");
  assert.equal(effectiveCompletedQty(null, 55), 55, "無期初基準");
});

test("effectiveCompletedQty 兩者皆無時回 null 而非 0", () => {
  // 這個區別很重要：null 會讓 progressFromQty 落回人工填報進度，
  // 0 則會算出 0% 並蓋掉人工值
  assert.equal(effectiveCompletedQty(null, null), null);
});

test("effectiveCompletedQty 區分「填報為 0」與「未填報」", () => {
  assert.equal(effectiveCompletedQty(0, null), 0, "期初明確為 0");
  assert.equal(effectiveCompletedQty(null, 0), 0, "日報明確加總為 0");
});

test("effectiveCompletedQty 忽略非有限數", () => {
  assert.equal(effectiveCompletedQty(Number.NaN, 5), 5);
  assert.equal(effectiveCompletedQty(10, Number.POSITIVE_INFINITY), 10);
  assert.equal(effectiveCompletedQty(Number.NaN, Number.NaN), null);
});

test("effectiveCompletedQty 支援小數（單位如 m3、式）", () => {
  assert.equal(effectiveCompletedQty(0.45, 0.1), 0.55);
});

// ── effectiveProgress ───────────────────────────────────────

test("effectiveProgress 已計量工項以數量推導，忽略人工值", () => {
  // 有效累計 300 / 契約 1000 = 30%，人工值 99 應被忽略
  const qty = { ...MEASURED, completedQty: 300 };
  assert.equal(effectiveProgress(qty, 99), 30);
});

test("effectiveProgress 未計量工項沿用人工填報值", () => {
  // 決策 F 的核心：無契約數量時無從推導，人工值是唯一來源
  assert.equal(effectiveProgress(UNMEASURED, 45), 45);
});

test("effectiveProgress 有契約數量但累計未填時仍落回人工值", () => {
  const qty = { ...MEASURED, completedQty: null };
  assert.equal(effectiveProgress(qty, 45), 45);
});

test("effectiveProgress 累計為 0 時算出 0%，不落回人工值", () => {
  const qty = { ...MEASURED, completedQty: 0 };
  assert.equal(effectiveProgress(qty, 80), 0, "0 是明確資料，不是缺值");
});

test("effectiveProgress 把人工值夾回 0-100", () => {
  assert.equal(effectiveProgress(UNMEASURED, 150), 100);
  assert.equal(effectiveProgress(UNMEASURED, -20), 0);
  assert.equal(effectiveProgress(UNMEASURED, Number.NaN), 0);
});

test("effectiveProgress 超做（累計 > 契約）時上限為 100", () => {
  const qty = { ...MEASURED, completedQty: 1500 };
  assert.equal(effectiveProgress(qty, 0), 100);
});

// ── withEffectiveQty ────────────────────────────────────────

test("withEffectiveQty 換掉 completedQty 且不動其他欄位", () => {
  const out = withEffectiveQty(MEASURED, 55);
  assert.equal(out.completedQty, 255);
  assert.equal(out.contractQty, 1000);
  assert.equal(out.unitPrice, 500);
  assert.equal(out.inspectedQty, 150);
  assert.equal(out.valuatedQty, 100);
});

test("withEffectiveQty 不就地修改傳入物件", () => {
  const src: LedgerQty = { ...MEASURED };
  withEffectiveQty(src, 55);
  assert.equal(src.completedQty, 200, "原物件不應被污染");
});

test("withEffectiveQtyAll 依 id 對應各自的日報加總", () => {
  const rows = [
    { id: "a", ...MEASURED },
    { id: "b", ...MEASURED, completedQty: 10 },
    { id: "c", ...MEASURED, completedQty: null },
  ];
  const totals = new Map([
    ["a", 55],
    ["c", 7],
  ]);
  const out = withEffectiveQtyAll(rows, totals);
  assert.equal(out[0].completedQty, 255, "期初 200 + 日報 55");
  assert.equal(out[1].completedQty, 10, "查無加總 → 僅期初");
  assert.equal(out[2].completedQty, 7, "無期初 → 僅日報");
});

// ── 與既有推導層的整合 ──────────────────────────────────────

test("既有 ledgerRow 推導餵入有效累計量後自動改以日報為準", () => {
  // 決策 A 的關鍵性質：推導邏輯零改動，只換輸入值
  const base = {
    id: "w1",
    code: "1-1",
    name: "管線工程",
    unit: "m",
    wbsCode: "WBS-1.1",
    wbsCategory: null,
    ...MEASURED,
  };

  const before = ledgerRow(base);
  assert.equal(before.completedAmount, 100_000, "期初 200 × 500");
  assert.equal(before.completionRate, 20);

  const after = ledgerRow(withEffectiveQty(base, 300));
  assert.equal(after.completedAmount, 250_000, "有效 500 × 500");
  assert.equal(after.completionRate, 50);
  // 契約金額不受影響
  assert.equal(after.contractAmount, before.contractAmount);
});

test("日報加總使查驗量大於累計量的異常消失（補登情形）", () => {
  // 期初 100 < 查驗 150 → 異常；日報補上 80 後累計 180 > 150 → 正常
  const base = {
    id: "w2",
    code: null,
    name: "側溝",
    unit: "m",
    wbsCode: null,
    wbsCategory: null,
    ...MEASURED,
    completedQty: 100,
    inspectedQty: 150,
    valuatedQty: 100,
  };

  assert.ok(
    ledgerRow(base).anomalies.some((a) => a.includes("查驗合格量")),
    "期初值下應出現異常",
  );
  assert.deepEqual(
    ledgerRow(withEffectiveQty(base, 80)).anomalies,
    [],
    "計入日報後異常應消失",
  );
});

// ── withEffectiveProgress（決策 F）──────────────────────────

/** 一列上捲用的工項；數量欄位刻意以 Decimal 風格的字串模擬資料庫回傳值。 */
const ROLLUP_ROW = {
  id: "w1",
  obligationId: "o1",
  progress: 20,
  contractQty: "1000",
  completedQty: "200",
};

test("withEffectiveProgress 以日報加總後的比例取代人工進度", () => {
  // 期初 200 + 日報 300 = 500；500/1000 = 50%
  const out = withEffectiveProgress(ROLLUP_ROW, 300);
  assert.equal(out.progress, 50, "人工填的 20 應被推導值取代");
});

test("withEffectiveProgress 保留其他欄位（上捲需要 obligationId）", () => {
  const out = withEffectiveProgress(ROLLUP_ROW, 300);
  assert.equal(out.obligationId, "o1");
  assert.equal(out.id, "w1");
  assert.equal(out.contractQty, "1000", "原始數量欄位不應被改寫");
});

test("withEffectiveProgress 不就地修改傳入物件", () => {
  const src = { ...ROLLUP_ROW };
  withEffectiveProgress(src, 300);
  assert.equal(src.progress, 20, "原物件不應被污染");
});

test("withEffectiveProgress 對未計量工項沿用人工填報進度", () => {
  // 決策 F 的核心：無契約數量者無從推導，人工值是唯一來源
  const out = withEffectiveProgress(
    { id: "w2", progress: 45, contractQty: null, completedQty: null },
    null,
  );
  assert.equal(out.progress, 45);
});

test("withEffectiveProgress 接受 Decimal 風格輸入（邊界轉數字）", () => {
  const out = withEffectiveProgress(
    { id: "w3", progress: 0, contractQty: "400", completedQty: "100" },
    null,
  );
  assert.equal(out.progress, 25, "字串型數量應被正確轉換");
});

test("withEffectiveProgress 無日報紀錄時僅以期初推導", () => {
  const out = withEffectiveProgress(ROLLUP_ROW, null);
  assert.equal(out.progress, 20, "200/1000 = 20%");
});

test("withEffectiveProgressAll 依 id 對應各自的日報加總", () => {
  const rows = [
    { id: "a", progress: 0, contractQty: 100, completedQty: 10 },
    { id: "b", progress: 77, contractQty: null, completedQty: null },
    { id: "c", progress: 0, contractQty: 200, completedQty: 0 },
  ];
  const out = withEffectiveProgressAll(rows, new Map([["a", 40], ["c", 50]]));
  assert.equal(out[0].progress, 50, "期初 10 + 日報 40 = 50/100");
  assert.equal(out[1].progress, 77, "未計量 → 沿用人工值");
  assert.equal(out[2].progress, 25, "0 + 50 = 50/200");
});

test("withEffectiveProgress 超做時上限為 100", () => {
  const out = withEffectiveProgress(ROLLUP_ROW, 5000);
  assert.equal(out.progress, 100);
});
