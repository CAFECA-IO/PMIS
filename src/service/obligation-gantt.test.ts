import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TIMELINE_PADDING_DAYS,
  buildBars,
  buildTimeline,
  dependencyLinks,
  geometryOf,
  positionOf,
  spanOfWorkItems,
  summarize,
  type GanttInput,
} from "./obligation-gantt";

const TODAY = "2026-07-27";

const item = (over: Partial<GanttInput> = {}): GanttInput => ({
  id: over.id ?? "o1",
  code: over.code ?? "A-01",
  title: over.title ?? "提送施工計畫書",
  stage: over.stage ?? "CONSTRUCTION",
  status: over.status ?? "IN_PROGRESS",
  risk: over.risk ?? "GREEN",
  dueDate: over.dueDate === undefined ? "2026-08-31" : over.dueDate,
  actualDate: over.actualDate ?? null,
  predecessorId: over.predecessorId ?? null,
  workItems: over.workItems ?? [],
});

// ── 橫條來源 ────────────────────────────────────────────────
test("橫條取歸屬分項的最早開始到最晚完成", () => {
  const span = spanOfWorkItems([
    { plannedStart: "2026-05-01", plannedEnd: "2026-06-30" },
    { plannedStart: "2026-04-15", plannedEnd: "2026-05-20" },
    { plannedStart: "2026-06-01", plannedEnd: "2026-09-15" },
  ]);
  assert.equal(span.start, "2026-04-15");
  assert.equal(span.end, "2026-09-15");
});

test("分項只填了一半的日期時仍算得出可用的一端", () => {
  const span = spanOfWorkItems([
    { plannedStart: "2026-05-01", plannedEnd: null },
    { plannedStart: null, plannedEnd: "2026-08-01" },
  ]);
  assert.equal(span.start, "2026-05-01");
  assert.equal(span.end, "2026-08-01");
});

test("沒有分項時沒有橫條，只留里程碑", () => {
  const bars = buildBars([item({ workItems: [] })], TODAY);
  assert.equal(bars[0].start, null);
  assert.equal(bars[0].end, null);
  assert.equal(bars[0].dueDate, "2026-08-31", "審查計畫書這類事項本質就是里程碑");
});

test("不合法的日期不會汙染範圍", () => {
  const span = spanOfWorkItems([
    { plannedStart: "2026-13-45", plannedEnd: "亂填" },
    { plannedStart: "2026-05-01", plannedEnd: "2026-06-01" },
  ]);
  assert.equal(span.start, "2026-05-01");
  assert.equal(span.end, "2026-06-01");
});

// ── 排列 ────────────────────────────────────────────────────
test("依時間軸位置排列，而非管制編號", () => {
  const bars = buildBars(
    [
      item({ id: "z", code: "Z-99", dueDate: "2026-03-01" }),
      item({ id: "a", code: "A-01", dueDate: "2026-09-01" }),
    ],
    TODAY,
  );
  assert.deepEqual(
    bars.map((b) => b.id),
    ["z", "a"],
    "甘特圖是看時序的工具，依編號排會看不出先後",
  );
  assert.deepEqual(
    bars.map((b) => b.row),
    [0, 1],
  );
});

test("有橫條者以起日排，無橫條者以期限排", () => {
  const bars = buildBars(
    [
      item({ id: "milestone", code: "M", dueDate: "2026-05-15" }),
      item({
        id: "bar",
        code: "B",
        dueDate: "2026-12-31",
        workItems: [{ plannedStart: "2026-04-01", plannedEnd: "2026-11-30" }],
      }),
    ],
    TODAY,
  );
  assert.deepEqual(
    bars.map((b) => b.id),
    ["bar", "milestone"],
  );
});

test("完全沒有日期的事項排到最後，但不被丟掉", () => {
  const bars = buildBars(
    [
      item({ id: "empty", code: "E", dueDate: null }),
      item({ id: "dated", code: "D", dueDate: "2026-08-01" }),
    ],
    TODAY,
  );
  assert.deepEqual(
    bars.map((b) => b.id),
    ["dated", "empty"],
  );
  assert.equal(bars.length, 2, "沒有日期不代表這項事項不存在");
});

// ── 逾期與完成 ──────────────────────────────────────────────
test("期限早於今日且未完成即為逾期", () => {
  const bars = buildBars(
    [item({ id: "late", dueDate: "2026-07-15", status: "OVERDUE" })],
    TODAY,
  );
  assert.equal(bars[0].overdue, true);
});

test("已完成的事項即使期限已過也不算逾期", () => {
  const bars = buildBars(
    [
      item({
        id: "done",
        dueDate: "2026-07-15",
        status: "DONE",
        actualDate: "2026-07-10",
      }),
    ],
    TODAY,
  );
  assert.equal(bars[0].overdue, false);
  assert.equal(bars[0].done, true);
});

test("沒有期限的事項不會被誤判逾期", () => {
  const bars = buildBars([item({ dueDate: null })], TODAY);
  assert.equal(bars[0].overdue, false);
});

// ── 時間軸 ──────────────────────────────────────────────────
test("時間軸涵蓋所有日期並兩端留白", () => {
  const bars = buildBars(
    [
      item({
        dueDate: "2026-08-31",
        workItems: [{ plannedStart: "2026-05-01", plannedEnd: "2026-08-15" }],
      }),
    ],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY);
  assert.ok(t);
  assert.equal(t.from, "2026-04-17", `5/1 前推 ${TIMELINE_PADDING_DAYS} 天`);
  assert.equal(t.to, "2026-09-14");
});

test("所有事項都在未來時，今天仍在軸上（否則今日線落在圖外）", () => {
  const bars = buildBars([item({ dueDate: "2027-06-30" })], TODAY);
  const t = buildTimeline(bars, TODAY);
  assert.ok(t);
  const pos = positionOf(t, TODAY);
  assert.ok(pos !== null && pos >= 0 && pos <= 1, `今天的位置為 ${pos}`);
});

test("所有事項都已過去時，今天同樣在軸上", () => {
  const bars = buildBars(
    [item({ dueDate: "2025-01-01", status: "DONE", actualDate: "2025-01-01" })],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY);
  assert.ok(t);
  const pos = positionOf(t, TODAY);
  assert.ok(pos !== null && pos >= 0 && pos <= 1);
});

test("月刻度連續且加總等於總天數", () => {
  const bars = buildBars(
    [
      item({
        dueDate: "2026-10-31",
        workItems: [{ plannedStart: "2026-05-01", plannedEnd: "2026-10-01" }],
      }),
    ],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY)!;
  assert.ok(t.months.length >= 6, `僅 ${t.months.length} 格月刻度`);
  const total = t.months.reduce((s, m) => s + m.days, 0);
  assert.equal(total, t.days, "月刻度不可有縫隙或重疊");
  // 逐格相鄰
  for (let i = 1; i < t.months.length; i++) {
    assert.equal(
      t.months[i].offsetDays,
      t.months[i - 1].offsetDays + t.months[i - 1].days,
    );
  }
});

test("跨年的月刻度標示正確", () => {
  const bars = buildBars(
    [
      item({
        dueDate: "2027-02-28",
        workItems: [{ plannedStart: "2026-12-01", plannedEnd: "2027-02-01" }],
      }),
    ],
    "2026-12-15",
  );
  const t = buildTimeline(bars, "2026-12-15")!;
  const labels = t.months.map((m) => m.label);
  assert.ok(labels.includes("2026 年 12 月"), labels.join("、"));
  assert.ok(labels.includes("2027 年 1 月"), labels.join("、"));
});

// ── 幾何 ────────────────────────────────────────────────────
test("橫條位置與期限里程碑各自算出", () => {
  const bars = buildBars(
    [
      item({
        dueDate: "2026-08-31",
        workItems: [{ plannedStart: "2026-05-01", plannedEnd: "2026-08-15" }],
      }),
    ],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY)!;
  const g = geometryOf(t, bars[0]);
  assert.ok(g.bar);
  assert.ok(g.bar.left > 0 && g.bar.left < 1);
  assert.ok(g.bar.width > 0 && g.bar.left + g.bar.width <= 1);
  assert.ok(g.milestone !== null && g.milestone > g.bar.left + g.bar.width);
});

test("單日作業仍看得見（寬度不為零）", () => {
  const bars = buildBars(
    [
      item({
        dueDate: "2026-06-01",
        workItems: [{ plannedStart: "2026-06-01", plannedEnd: "2026-06-01" }],
      }),
    ],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY)!;
  const g = geometryOf(t, bars[0]);
  assert.ok(g.bar && g.bar.width > 0, "寬度為 0 的橫條等於沒畫");
});

test("只有里程碑時沒有橫條幾何", () => {
  const bars = buildBars([item({ dueDate: "2026-08-31" })], TODAY);
  const t = buildTimeline(bars, TODAY)!;
  const g = geometryOf(t, bars[0]);
  assert.equal(g.bar, null);
  assert.ok(g.milestone !== null);
});

test("實際完成日另外標示，可與期限比對", () => {
  const bars = buildBars(
    [
      item({
        dueDate: "2026-08-31",
        actualDate: "2026-09-10",
        status: "DONE",
      }),
    ],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY)!;
  const g = geometryOf(t, bars[0]);
  assert.ok(g.actual !== null && g.milestone !== null);
  assert.ok(g.actual > g.milestone, "晚於期限完成，圖上要看得出來");
});

// ── 依存線 ──────────────────────────────────────────────────
test("前置事項連到後續事項", () => {
  const bars = buildBars(
    [
      item({ id: "a", code: "A", dueDate: "2026-06-30" }),
      item({ id: "b", code: "B", dueDate: "2026-08-31", predecessorId: "a" }),
    ],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY)!;
  const links = dependencyLinks(bars, t);
  assert.equal(links.length, 1);
  assert.equal(links[0].fromRow, 0);
  assert.equal(links[0].toRow, 1);
  assert.ok(links[0].fromX < links[0].toX);
  assert.equal(links[0].conflicting, false);
});

test("前置事項的期限比後續還晚時標為時序矛盾", () => {
  const bars = buildBars(
    [
      item({ id: "a", code: "A", dueDate: "2026-12-31" }),
      item({ id: "b", code: "B", dueDate: "2026-08-31", predecessorId: "a" }),
    ],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY)!;
  const links = dependencyLinks(bars, t);
  assert.equal(links.length, 1);
  assert.equal(links[0].conflicting, true, "方向反了，畫成線才一眼看出來");
});

test("前置事項已完成時，線自實際完成日出發", () => {
  const bars = buildBars(
    [
      item({
        id: "a",
        code: "A",
        dueDate: "2026-06-30",
        actualDate: "2026-07-20",
        status: "DONE",
      }),
      item({ id: "b", code: "B", dueDate: "2026-08-31", predecessorId: "a" }),
    ],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY)!;
  const links = dependencyLinks(bars, t);
  const fromActual = positionOf(t, "2026-07-20");
  assert.equal(links[0].fromX, fromActual, "已完成者應以實際日期為起點");
});

test("前置事項不在目前檢視範圍內時不畫線，也不出錯", () => {
  const bars = buildBars(
    [item({ id: "b", code: "B", dueDate: "2026-08-31", predecessorId: "不存在" })],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY)!;
  assert.deepEqual(dependencyLinks(bars, t), []);
});

// ── 摘要 ────────────────────────────────────────────────────
test("摘要數出列數、逾期、完成與矛盾", () => {
  const bars = buildBars(
    [
      item({ id: "a", code: "A", dueDate: "2026-12-31" }),
      item({
        id: "b",
        code: "B",
        dueDate: "2026-08-31",
        predecessorId: "a",
        workItems: [{ plannedStart: "2026-05-01", plannedEnd: "2026-08-01" }],
      }),
      item({ id: "c", code: "C", dueDate: "2026-07-01", status: "OVERDUE" }),
      item({
        id: "d",
        code: "D",
        dueDate: "2026-06-01",
        status: "DONE",
        actualDate: "2026-05-30",
      }),
    ],
    TODAY,
  );
  const t = buildTimeline(bars, TODAY)!;
  const s = summarize(bars, dependencyLinks(bars, t));
  assert.equal(s.rows, 4);
  assert.equal(s.withBars, 1);
  assert.equal(s.overdue, 1);
  assert.equal(s.done, 1);
  assert.equal(s.conflicts, 1);
});

test("沒有任何事項時回 null，由畫面顯示空狀態", () => {
  assert.equal(buildTimeline([], TODAY)?.from !== undefined, true, "至少含今天");
  const t = buildTimeline([], TODAY)!;
  assert.ok(positionOf(t, TODAY) !== null);
});
