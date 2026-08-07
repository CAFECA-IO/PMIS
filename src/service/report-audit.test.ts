import { test } from "node:test";
import assert from "node:assert/strict";

import {
  actionsFor,
  describeCreation,
  describeDeletion,
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
  assert.ok(d?.summary.includes("天氣：晴 → 雨"));
  assert.ok(!d?.summary.includes("施工概況"), "未改變的欄位不應出現");
});

test("describeFieldChanges 保存未截斷的變更前欄位", () => {
  /*
    摘要會截斷，而 DB 欄位會被新值覆寫。免計工期依據這類直接對應金額的
    敘述，若只留 60 字摘要就等於從 DB 與軌跡兩邊同時消失。
  */
  const basis =
    "本日因連續降雨致基礎開挖無法施作，依契約及主辦機關指示全日停工，" +
    "現場已完成擋土支撐與排水設施之檢查並拍照存證，" +
    "經監造確認符合契約第 7 條免計工期之情形。";
  const before = { summary: basis, exclusionBasis: basis };
  const d = describeFieldChanges(before, {
    summary: "更正：澆置量改為 118 立方公尺",
    exclusionBasis: basis,
  })!;

  assert.ok(d.summary.includes("…"), "摘要仍應截斷，軌跡列表才讀得下去");
  const parsed = JSON.parse(d.before) as Record<string, string | null>;
  assert.equal(parsed.summary, basis, "完整原文必須留在軌跡裡");
  assert.equal(
    parsed.exclusionBasis,
    basis,
    "未變動的欄位也一併保存，重建不必跨筆推敲",
  );
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
  assert.ok(
    d?.summary.includes("重要事項：待改善 → （空）"),
    "刪掉內容也要看得出來",
  );
});

test("describeFieldChanges 截斷過長的值", () => {
  const long = "很長".repeat(100);
  const d = describeFieldChanges({ summary: null }, { summary: long })!;
  assert.ok(d.summary.includes("…"), "摘要應截斷");
  assert.ok(d.summary.length < 400, "摘要不應塞入整段敘述");
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
  assert.ok(
    c.summary.includes("修改 化冀池打除 3m → 7m"),
    `不應被誤判為新增＋移除，實得：${c.summary}`,
  );
});

// ── describeCreation ───────────────────────────────────────

test("describeCreation 記下初始值而非只記欄位名", () => {
  const d = describeCreation(
    { weather: "雨", summary: "施工中", keyNotes: null },
    [row("a", "管線", 10)],
  );
  assert.ok(
    d.summary.includes("天氣：雨"),
    "值本身才有意義（「填了天氣」說明不了什麼）",
  );
  assert.ok(d.summary.includes("施工概況：施工中"));
  assert.ok(!d.summary.includes("重要事項"), "未填的欄位不應列入");
  assert.ok(d.summary.includes("數量表 1 項"));
  assert.ok(d.summary.includes("管線 10m"));
});

test("describeCreation 保存未截斷的初始內容", () => {
  const long = "很長".repeat(100);
  const d = describeCreation({ summary: long }, [row("a", "管線", 10)]);
  const parsed = JSON.parse(d.before) as {
    fields: Record<string, string | null>;
    items: unknown[];
  };
  assert.equal(parsed.fields.summary, long, "建立時的原文不得只留摘要");
  assert.deepEqual(parsed.items, [row("a", "管線", 10)]);
});

test("describeCreation 無數量表時明言無資料", () => {
  const d = describeCreation({ summary: "例假日" }, []);
  assert.ok(d.summary.includes("數量表無資料"), "空白與未填不同，須寫明");
});

test("describeCreation 全空時仍產出可辨識的紀錄", () => {
  // CREATE 的 detail 不可為空 —— 空白紀錄等於沒記
  const d = describeCreation({ summary: null, weather: null }, []);
  assert.ok(d.summary.length > 0);
  assert.ok(d.summary.includes("建立日報"));
});

test("describeCreation 摘要截斷但快照完整", () => {
  const d = describeCreation({ summary: "很長".repeat(500) }, []);
  assert.ok(d.summary.length <= 501, "摘要不應塞入整段敘述");
  assert.ok(d.before.length > 1000, "快照必須保留完整內容");
});

// ── describeDeletion ───────────────────────────────────────

const deletion = (over: Partial<Parameters<typeof describeDeletion>[0]> = {}) =>
  describeDeletion({
    reportDateLabel: "2026-03-14",
    statusLabel: "已提送",
    fields: { summary: "澆置", excludedFromDuration: "否" },
    items: [row("a", "管線", 10)],
    ...over,
  });

test("describeDeletion 記下是哪一天的日報", () => {
  // 本表無外鍵，刪除後 reportId 已無對應；沒有日期就不知道哪一天的量不見了
  assert.ok(deletion().summary.includes("2026-03-14"));
  assert.ok(deletion().summary.includes("已提送"), "狀態決定它是否曾計入累計");
});

test("describeDeletion 一律列出免計工期宣告，即使為否", () => {
  // 免計工期在展延爭議中有金額意義；「沒有宣告」本身也是要留存的事實
  assert.ok(deletion().summary.includes("免計工期：否"));
  const withBasis = deletion({
    fields: { excludedFromDuration: "是", exclusionBasis: "契約第 12 條" },
  });
  assert.ok(withBasis.summary.includes("免計工期：是（契約第 12 條）"));
  const missing = deletion({ fields: { summary: "澆置" } });
  assert.ok(
    missing.summary.includes("免計工期：未載明"),
    "欄位缺值不可靜默略過",
  );
});

test("describeDeletion 保存欄位與數量表的完整快照", () => {
  const d = deletion();
  const parsed = JSON.parse(d.before) as {
    fields: Record<string, string | null>;
    items: unknown[];
  };
  assert.equal(parsed.fields.summary, "澆置", "文字內容刪除後只剩這份快照");
  assert.deepEqual(parsed.items, [row("a", "管線", 10)]);
});

test("describeDeletion 無數量表時寫明，不留空白", () => {
  assert.ok(deletion({ items: [] }).summary.includes("無數量表"));
});

// ── actionsFor ──────────────────────────────────────────────

test("actionsFor 新建時只記 CREATE", () => {
  assert.deepEqual(
    actionsFor({
      isNew: true,
      fieldChanges: { summary: "x", before: "{}" },
      statusChanged: true,
      qtyChanges: null,
    }),
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
      fieldChanges: { summary: "天氣：晴 → 雨", before: "{}" },
      statusChanged: true,
      qtyChanges: { summary: "s", before: "[]" },
    }),
    ["UPDATE", "STATUS", "ITEMS"],
  );
});

// ── 契約外同名項目（無穩定身分）──────────────────────────────

const ext = (name: string, qty: number, over: Partial<QtySnapshotRow> = {}) =>
  row(null, name, qty, over);

test("describeQtyChanges 同名契約外項目刪除其中一列必留軌跡", () => {
  /*
    先前以 `x:${itemName}` 當 Map 鍵，同名兩列靜默收斂成最後一筆：
    刪掉「雜項 3」後 before/after 都只剩 7 → 判定無異動 → 完全不寫軌跡，
    而 3 已從累計與估驗金額中消失。
  */
  const c = describeQtyChanges([ext("雜項", 3), ext("雜項", 7)], [ext("雜項", 7)]);
  assert.ok(c, "數量減少卻無軌跡是最嚴重的失效");
  assert.ok(c!.summary.includes("3m、7m → 7m"), `實得：${c!.summary}`);
});

test("describeQtyChanges 同名契約外項目刪除另一列不得誤述為修改", () => {
  const c = describeQtyChanges([ext("雜項", 3), ext("雜項", 7)], [ext("雜項", 3)])!;
  assert.ok(c.summary.includes("3m、7m → 3m"), `實得：${c.summary}`);
  assert.ok(!c.summary.includes("7 → 3"), "不得說成把 7 改為 3");
});

test("describeQtyChanges 同名契約外項目新增一列不得誤述為修改", () => {
  const c = describeQtyChanges([ext("雜項", 3)], [ext("雜項", 3), ext("雜項", 9)])!;
  assert.ok(c.summary.includes("3m → 3m、9m"), `實得：${c.summary}`);
});

test("describeQtyChanges 同名契約外項目僅調換順序視為無異動", () => {
  // 那兩列本來就分不出誰是誰；順序不同不代表內容改變
  assert.equal(
    describeQtyChanges(
      [ext("雜項", 3), ext("雜項", 7)],
      [ext("雜項", 7), ext("雜項", 3)],
    ),
    null,
  );
});

test("describeQtyChanges 契約外項目整組移除仍記得每一列", () => {
  const c = describeQtyChanges([ext("雜項", 3), ext("雜項", 7)], [])!;
  assert.ok(c.summary.includes("移除 雜項 3m、7m"), `實得：${c.summary}`);
});

test("describeQtyChanges 台帳工項仍以 workItemId 逐項比對", () => {
  // 同名不同工項不得被併成一組
  const c = describeQtyChanges(
    [row("a", "管線", 10), row("b", "管線", 20)],
    [row("a", "管線", 15), row("b", "管線", 20)],
  )!;
  assert.ok(c.summary.includes("管線 10 → 15"));
  assert.ok(!c.summary.includes("20"), "未變動的同名工項不應出現");
});
