import { test } from "node:test";
import assert from "node:assert/strict";

import {
  actionsFor,
  describeFieldChanges,
  describeQtyChanges,
  type QtySnapshotRow,
} from "./report-audit";

// ── describeFieldChanges ────────────────────────────────────

test("describeFieldChanges 只列出真正改變的欄位", () => {
  const d = describeFieldChanges(
    { weather: "晴", summary: "施工中", keyNotes: null },
    { weather: "雨", summary: "施工中", keyNotes: null },
  );
  assert.ok(d?.includes("天氣：晴 → 雨"));
  assert.ok(!d?.includes("施工概況"), "未改變的欄位不應出現");
});

test("describeFieldChanges 無異動時回 null", () => {
  assert.equal(
    describeFieldChanges({ weather: "晴" }, { weather: "晴" }),
    null,
  );
  // null 與空字串視為相同，避免「（空）→（空）」這種無意義紀錄
  assert.equal(describeFieldChanges({ summary: null }, { summary: "" }), null);
});

test("describeFieldChanges 空值以「（空）」呈現而非略過", () => {
  const d = describeFieldChanges({ keyNotes: "待改善" }, { keyNotes: null });
  assert.ok(d?.includes("重要事項：待改善 → （空）"), "刪掉內容也要看得出來");
});

test("describeFieldChanges 截斷過長的值", () => {
  const long = "很長".repeat(100);
  const d = describeFieldChanges({ summary: null }, { summary: long })!;
  assert.ok(d.includes("…"), "應截斷");
  assert.ok(d.length < 200, "單筆軌跡不應塞入整段敘述");
});

// ── describeQtyChanges ──────────────────────────────────────

const row = (
  id: string | null,
  name: string,
  qty: number,
): QtySnapshotRow => ({
  workItemId: id,
  itemName: name,
  unit: "m",
  dailyQty: qty,
});

test("describeQtyChanges 分辨修改／新增／移除", () => {
  const c = describeQtyChanges(
    [row("a", "管線", 10), row("b", "側溝", 5)],
    [row("a", "管線", 30), row("c", "路面", 8)],
  )!;
  assert.ok(c.summary.includes("修改 管線 10 → 30"));
  assert.ok(c.summary.includes("新增 路面 8"));
  assert.ok(c.summary.includes("移除 側溝 5"));
});

test("describeQtyChanges 無異動時回 null", () => {
  assert.equal(describeQtyChanges([row("a", "管線", 10)], [row("a", "管線", 10)]), null);
  assert.equal(describeQtyChanges([], []), null);
});

test("describeQtyChanges 保存變更「前」的完整明細", () => {
  // 變更後的值讀現況即得；變更前的一旦覆寫就永遠消失，那才是要保住的
  const before = [row("a", "管線", 10)];
  const c = describeQtyChanges(before, [row("a", "管線", 30)])!;
  assert.deepEqual(JSON.parse(c.before), before);
});

test("describeQtyChanges 以名稱區分契約外項目（workItemId 為 null）", () => {
  const c = describeQtyChanges(
    [row(null, "化冀池打除", 3)],
    [row(null, "化冀池打除", 7)],
  )!;
  assert.ok(c.summary.includes("修改 化冀池打除 3 → 7"), "不應被誤判為新增＋移除");
});

// ── actionsFor ──────────────────────────────────────────────

test("actionsFor 新建時只記 CREATE", () => {
  assert.deepEqual(
    actionsFor({ isNew: true, fieldChanges: "x", statusChanged: true, qtyChanges: null }),
    ["CREATE"],
  );
});

test("actionsFor 依實際異動決定動作，無異動則不寫", () => {
  assert.deepEqual(
    actionsFor({ isNew: false, fieldChanges: null, statusChanged: false, qtyChanges: null }),
    [],
    "無異動不應留下雜訊紀錄",
  );
  assert.deepEqual(
    actionsFor({
      isNew: false,
      fieldChanges: "天氣：晴 → 雨",
      statusChanged: true,
      qtyChanges: { summary: "s", before: "[]" },
    }),
    ["UPDATE", "STATUS", "ITEMS"],
  );
});
