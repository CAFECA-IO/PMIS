import { test } from "node:test";
import assert from "node:assert/strict";

import {
  actionsFor,
  describeCreation,
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
  extra: Partial<QtySnapshotRow> = {},
): QtySnapshotRow => ({
  workItemId: id,
  itemName: name,
  unit: "m",
  dailyQty: qty,
  note: null,
  ...extra,
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

test("describeQtyChanges 記錄單位變更（量綱改變不可無痕）", () => {
  const c = describeQtyChanges(
    [row("a", "路面刨除", 10, { unit: "m" })],
    [row("a", "路面刨除", 10, { unit: "m2" })],
  );
  // 數量沒動但量綱改了，累計就對不上；只比 dailyQty 會讓這件事完全不留痕
  assert.ok(c, "只改單位也必須留下軌跡");
  assert.ok(c!.summary.includes("單位 m → m2"));
});

test("describeQtyChanges 記錄備註變更", () => {
  const c = describeQtyChanges(
    [row("a", "管線", 10, { note: "含試壓" })],
    [row("a", "管線", 10, { note: null })],
  );
  assert.ok(c, "只改備註也必須留下軌跡");
  assert.ok(c!.summary.includes("備註 含試壓 → （空）"));
});

test("describeQtyChanges 同一列多處變更併為一句", () => {
  const c = describeQtyChanges(
    [row("a", "管線", 10, { unit: "m", note: null })],
    [row("a", "管線", 12, { unit: "m2", note: "更正量綱" })],
  )!;
  assert.ok(c.summary.includes("10 → 12"));
  assert.ok(c.summary.includes("單位 m → m2"));
  assert.ok(c.summary.includes("備註"));
  assert.equal(
    c.summary.split("管線").length - 1,
    1,
    "同一列不應拆成多筆而讓軌跡難讀",
  );
});

test("describeQtyChanges 的變更前明細含備註（供回溯重建）", () => {
  const before = [row("a", "管線", 10, { note: "含試壓" })];
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

// ── describeCreation ───────────────────────────────────────

test("describeCreation 記下初始值而非只記欄位名", () => {
  const d = describeCreation(
    { weather: "雨", summary: "施工中", keyNotes: null },
    [row("a", "管線", 10)],
  );
  assert.ok(d.includes("天氣：雨"), "值本身才有意義（「填了天氣」說明不了什麼）");
  assert.ok(d.includes("施工概況：施工中"));
  assert.ok(!d.includes("重要事項"), "未填的欄位不應列入");
  assert.ok(d.includes("數量表 1 項"));
  assert.ok(d.includes("管線 10m"));
});

test("describeCreation 無數量表時明言無資料", () => {
  const d = describeCreation({ summary: "例假日" }, []);
  assert.ok(d.includes("數量表無資料"), "空白與未填不同，須寫明");
});

test("describeCreation 全空時仍產出可辨識的紀錄", () => {
  // CREATE 的 detail 不可為空 —— 空白紀錄等於沒記
  const d = describeCreation({ summary: null, weather: null }, []);
  assert.ok(d.length > 0);
  assert.ok(d.includes("建立日報"));
});

test("describeCreation 截斷過長內容", () => {
  const d = describeCreation({ summary: "很長".repeat(500) }, []);
  assert.ok(d.length <= 501, "單筆軌跡不應塞入整段敘述");
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
