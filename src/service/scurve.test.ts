import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSCurve,
  buildWorkItemSCurve,
  currentProgress,
  type SCurveInput,
  type WorkItemInput,
  workItemWeight,
  plannedProgressAt,
  weightedProgressDelta,
} from "./scurve";

// 固定「今日」為 2026-03-15，讓 actual 計算可預期
const NOW = new Date("2026-03-15T00:00:00").getTime();

const base: SCurveInput[] = [
  { weight: 1, plannedDate: new Date("2026-01-20"), actualDate: new Date("2026-01-25") },
  { weight: 1, plannedDate: new Date("2026-02-20"), actualDate: new Date("2026-02-18") },
  { weight: 1, plannedDate: new Date("2026-03-20"), actualDate: null },
  { weight: 1, plannedDate: new Date("2026-04-20"), actualDate: null },
];

test("空資料回傳空陣列", () => {
  assert.deepEqual(buildSCurve([], NOW), []);
  assert.deepEqual(
    buildSCurve([{ weight: 0, plannedDate: null, actualDate: null }], NOW),
    [],
  );
});

test("planned 依預定日累計、actual 僅計到今日所在月", () => {
  const pts = buildSCurve(base, NOW);
  // 桶：2026/01..2026/04
  assert.equal(pts.length, 4);
  assert.deepEqual(
    pts.map((p) => p.label),
    ["2026/01", "2026/02", "2026/03", "2026/04"],
  );
  // planned 累計：25 / 50 / 75 / 100
  assert.deepEqual(
    pts.map((p) => p.planned),
    [25, 50, 75, 100],
  );
  // 今日在 3 月：actual 到 3 月為止（2 個已完成 = 50%），4 月為未來 → null
  assert.deepEqual(
    pts.map((p) => p.actual),
    [25, 50, 50, null],
  );
});

test("提高某履約事項權重會改變累計占比（資料連動）", () => {
  const heavier = base.map((m, i) =>
    i === 0 ? { ...m, weight: 3 } : m,
  );
  const pts = buildSCurve(heavier, NOW);
  // 總權重 = 6；第一個(權重3)已完成 → 1 月 actual = 50%
  assert.equal(pts[0].actual, 50);
  // 1 月 planned = 3/6 = 50%
  assert.equal(pts[0].planned, 50);
});

test("延後實際完成日會降低當期 actual", () => {
  const delayed = base.map((m, i) =>
    i === 1 ? { ...m, actualDate: new Date("2026-05-01") } : m,
  );
  const pts = buildSCurve(delayed, NOW);
  // 第二個履約事項延到 5 月才完成 → 2、3 月 actual 只剩 25%
  assert.equal(pts[1].actual, 25);
  assert.equal(pts[2].actual, 25);
});

test("forecast 自目前實際外推至末月 100%", () => {
  const pts = buildSCurve(base, NOW);
  const last = pts[pts.length - 1];
  assert.equal(last.forecast, 100);
});

// ── 工程分項（WorkItem）基準 ───────────────────────────────
const WI_NOW = new Date("2026-03-31T00:00:00").getTime();
const workItems: WorkItemInput[] = [
  {
    plannedStart: new Date("2026-01-01"),
    plannedEnd: new Date("2026-02-28"), // 58 天
    actualStart: new Date("2026-01-01"),
    actualEnd: new Date("2026-02-20"),
    progress: 100,
  },
  {
    plannedStart: new Date("2026-03-01"),
    plannedEnd: new Date("2026-04-30"), // 60 天
    actualStart: new Date("2026-03-01"),
    actualEnd: null,
    progress: 50,
  },
];

test("工項基準：無可排程工項回傳空陣列", () => {
  assert.deepEqual(
    buildWorkItemSCurve(
      [{ plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null, progress: 30 }],
      WI_NOW,
    ),
    [],
  );
});

test("工項基準：預定末月達 100、當期實際為工期加權進度", () => {
  const pts = buildWorkItemSCurve(workItems, WI_NOW);
  assert.equal(pts.length, 4); // 2026/01..04
  assert.equal(pts[3].planned, 100);
  assert.equal(pts[3].actual, null); // 4 月為未來
  assert.equal(pts[3].forecast, 100);
  // 當期(3月)實際 = (58*1.0 + 60*0.5)/118*100 ≈ 74.58
  assert.ok(
    Math.abs((pts[2].actual ?? 0) - 74.58) < 0.6,
    `got ${pts[2].actual}`,
  );
  // planned 單調不減
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i].planned >= pts[i - 1].planned);
  }
});

test("工項基準：提高工項進度會拉高實際曲線", () => {
  const better = workItems.map((w, i) => (i === 1 ? { ...w, progress: 100 } : w));
  const pts = buildWorkItemSCurve(better, WI_NOW);
  assert.equal(pts[2].actual, 100); // 兩項皆完成
});

test("currentProgress 取今日期的實際/預定與落差", () => {
  const pts = buildSCurve(base, NOW); // 今日 3 月：actual 50、planned 75
  const cp = currentProgress(pts);
  assert.equal(cp.overall, 50);
  assert.equal(cp.planned, 75);
  assert.equal(cp.gap, -25);
  assert.deepEqual(currentProgress([]), { overall: 0, planned: 0, gap: 0 });
});

// ── 工程分項基準的預定/完成（決策 C／I）────────────────────

const wi = (ps: string | null, pe: string | null, progress = 0) => ({
  plannedStart: ps ? new Date(ps) : null,
  plannedEnd: pe ? new Date(pe) : null,
  actualStart: null,
  actualEnd: null,
  progress,
});

test("workItemWeight：權重為預定工期天數，無預定日則為 1", () => {
  assert.equal(workItemWeight(wi("2026-01-01", "2026-01-11")), 10);
  assert.equal(workItemWeight(wi(null, null)), 1);
  assert.equal(workItemWeight(wi("2026-01-01", "2026-01-01")), 1, "同日至少為 1");
});

test("plannedProgressAt：單一工項於預定期間內線性展開", () => {
  const items = [wi("2026-01-01", "2026-01-11")];
  assert.equal(plannedProgressAt(items, new Date("2026-01-01")), 0);
  assert.equal(plannedProgressAt(items, new Date("2026-01-06")), 50, "期間過半 → 50%");
  assert.equal(plannedProgressAt(items, new Date("2026-01-11")), 100);
});

test("plannedProgressAt：超出預定期間兩端皆夾在 0–100", () => {
  const items = [wi("2026-01-01", "2026-01-11")];
  assert.equal(plannedProgressAt(items, new Date("2025-12-01")), 0);
  assert.equal(plannedProgressAt(items, new Date("2026-06-01")), 100);
});

test("plannedProgressAt：以預定工期天數加權，長工項影響較大", () => {
  // A 工期 10 天、B 工期 90 天；取 B 剛好過半、A 已完成的時點
  const items = [wi("2026-01-01", "2026-01-11"), wi("2026-01-01", "2026-04-01")];
  const at = new Date("2026-02-15"); // A:100%、B:約 50%
  const v = plannedProgressAt(items, at)!;
  assert.ok(v > 50 && v < 60, `應由長工項主導，實得 ${v}`);
});

test("plannedProgressAt：無具預定起訖日的工項時回 null，不臆造 0", () => {
  assert.equal(plannedProgressAt([], new Date()), null);
  assert.equal(plannedProgressAt([wi(null, null)], new Date()), null);
});

test("plannedProgressAt：忽略缺預定日的工項，不讓其稀釋分母", () => {
  const items = [wi("2026-01-01", "2026-01-11"), wi(null, null)];
  assert.equal(
    plannedProgressAt(items, new Date("2026-01-11")),
    100,
    "有排程者已全數完成，缺排程者不應把結果拉低",
  );
});

test("weightedProgressDelta：以工期天數加權彙總各工項本期增量", () => {
  const rows = [
    { plannedStart: new Date("2026-01-01"), plannedEnd: new Date("2026-01-11"), delta: 100 },
    { plannedStart: new Date("2026-01-01"), plannedEnd: new Date("2026-01-11"), delta: 0 },
  ];
  assert.equal(weightedProgressDelta(rows), 50, "等權重、一個 100% 一個 0% → 50%");
});

test("weightedProgressDelta：空陣列回 null；增量夾在 0–100", () => {
  assert.equal(weightedProgressDelta([]), null);
  const one = [{ plannedStart: null, plannedEnd: null, delta: 250 }];
  assert.equal(weightedProgressDelta(one), 100, "超過 100 應夾住");
  const neg = [{ plannedStart: null, plannedEnd: null, delta: -30 }];
  assert.equal(weightedProgressDelta(neg), 0, "負值應夾住");
});
