/**
 * Info: (20260804 - Julian)
 * 週期用詞、工期計算與工作日判定的單元測試（純函式、決定論）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PERIOD_LABEL,
  PERIOD_REPORT_NAME,
  summarizeDuration,
  classifyWorkDay,
  summarizeWorkDays,
  describeGap,
  periodProgressDelta,
  trimCurveWindow,
  monthLabel,
} from "./report-period";

test("PERIOD_LABEL：四種週期用詞各異，不寫死「本月」", () => {
  assert.equal(PERIOD_LABEL.WEEKLY, "本週");
  assert.equal(PERIOD_LABEL.MONTHLY, "本月");
  assert.equal(PERIOD_LABEL.QUARTERLY, "本季");
  assert.equal(PERIOD_LABEL.ANNUAL, "本年");
  const labels = Object.values(PERIOD_LABEL);
  assert.equal(new Set(labels).size, labels.length, "用詞不應重複");
  assert.equal(PERIOD_REPORT_NAME.QUARTERLY, "季報");
});

test("summarizeDuration：正常計算累積／剩餘／比例", () => {
  const d = summarizeDuration(
    new Date("2024-01-01"),
    new Date("2024-01-31"),
    100,
  );
  assert.equal(d.elapsed, 30);
  assert.equal(d.total, 100);
  assert.equal(d.remaining, 70);
  assert.equal(d.usedPercent, 30);
});

test("summarizeDuration：契約工期未填 → total/remaining/percent 為 null", () => {
  const d = summarizeDuration(new Date("2024-01-01"), new Date("2024-01-31"), null);
  assert.equal(d.elapsed, 30);
  assert.equal(d.total, null);
  assert.equal(d.remaining, null);
  assert.equal(d.usedPercent, null);
});

test("summarizeDuration：無開工日 → elapsed 為 null；期末早於開工 → 不為負", () => {
  const noStart = summarizeDuration(null, new Date("2024-01-31"), 100);
  assert.equal(noStart.elapsed, null);
  assert.equal(noStart.remaining, null);

  const before = summarizeDuration(
    new Date("2024-02-01"),
    new Date("2024-01-01"),
    100,
  );
  assert.equal(before.elapsed, 0);
  assert.equal(before.remaining, 100);
});

test("summarizeDuration：逾期（elapsed > total）剩餘為 0 不為負", () => {
  const d = summarizeDuration(new Date("2024-01-01"), new Date("2024-12-31"), 100);
  assert.equal(d.remaining, 0);
});

test("classifyWorkDay：施工／雨天停工／例假日", () => {
  assert.equal(
    classifyWorkDay({
      reportDate: new Date(),
      weather: "晴",
      summary: "化冀池打除：XX 街 1-10 號。",
    }),
    "WORKING",
  );
  assert.equal(
    classifyWorkDay({
      reportDate: new Date(),
      weather: "雨",
      summary: "本日下雨，暫停施工。",
    }),
    "RAIN_STOP",
  );
  assert.equal(
    classifyWorkDay({
      reportDate: new Date(),
      weather: "晴",
      summary: "例假日，未施工。",
    }),
    "HOLIDAY",
  );
});

test("classifyWorkDay：敘述為空視為未排工；雨天但仍施工不算停工", () => {
  assert.equal(
    classifyWorkDay({ reportDate: new Date(), weather: "晴", summary: null }),
    "HOLIDAY",
  );
  assert.equal(
    classifyWorkDay({
      reportDate: new Date(),
      weather: "雨",
      summary: "雨中持續進行用戶接管。",
    }),
    "WORKING",
    "天氣為雨但未停工 → 仍為施工日",
  );
});

test("summarizeWorkDays：分類總和守恆", () => {
  const logs = [
    { reportDate: new Date(), weather: "晴", summary: "施工中" },
    { reportDate: new Date(), weather: "雨", summary: "本日下雨，暫停施工。" },
    { reportDate: new Date(), weather: "晴", summary: "例假日，未施工。" },
    { reportDate: new Date(), weather: "多雲", summary: null },
  ];
  const s = summarizeWorkDays(logs);
  assert.equal(s.working, 1);
  assert.equal(s.rainStop, 1);
  assert.equal(s.holiday, 2);
  assert.equal(s.working + s.rainStop + s.holiday, s.total);
});

test("periodProgressDelta：期間內權重占比，四種週期皆可算", () => {
  const items = [
    { weight: 3, dueDate: new Date("2026-05-10"), actualDate: new Date("2026-05-09") },
    { weight: 2, dueDate: new Date("2026-05-20"), actualDate: null },
    { weight: 5, dueDate: new Date("2026-06-01"), actualDate: null },
  ];
  const d = periodProgressDelta(
    items,
    new Date("2026-05-01"),
    new Date("2026-05-31T23:59:59"),
  );
  assert.equal(d.planned, 50, "5 月到期權重 3+2 = 5 / 10 → 50%");
  assert.equal(d.actual, 30, "5 月完成權重 3 / 10 → 30%");

  const week = periodProgressDelta(
    items,
    new Date("2026-05-05"),
    new Date("2026-05-11T23:59:59"),
  );
  assert.equal(week.planned, 30, "單週亦可算：僅 5/10 到期");
});

test("periodProgressDelta：無權重 → null（呼叫端顯示 —）", () => {
  const d = periodProgressDelta([], new Date("2026-05-01"), new Date("2026-05-31"));
  assert.equal(d.planned, null);
  assert.equal(d.actual, null);
});

test("trimCurveWindow：以期末為錨保留區間，並延伸一點呈現趨勢", () => {
  const pts = ["2026/01", "2026/02", "2026/03", "2026/04", "2026/05", "2026/06"].map(
    (label) => ({ label }),
  );
  const w = trimCurveWindow(pts, "2026/04", 3);
  assert.deepEqual(
    w.map((p) => p.label),
    ["2026/02", "2026/03", "2026/04", "2026/05"],
    "錨點前 3 點 + 後 1 點",
  );
  assert.equal(trimCurveWindow([], "2026/04", 3).length, 0);
  const notFound = trimCurveWindow(pts, "2099/12", 2);
  assert.deepEqual(notFound.map((p) => p.label), ["2026/05", "2026/06"], "找不到錨點時取尾端");
});

test("monthLabel：與 buildSCurve 的 YYYY/MM 格式一致", () => {
  assert.equal(monthLabel(new Date("2026-05-15")), "2026/05");
  assert.equal(monthLabel(new Date("2026-12-01")), "2026/12");
});

test("describeGap：超前／落後／相符", () => {
  assert.equal(describeGap(9.99), "超前 9.99 個百分點");
  assert.equal(describeGap(-3.5), "落後 3.5 個百分點");
  assert.equal(describeGap(0), "與預定相符");
});
