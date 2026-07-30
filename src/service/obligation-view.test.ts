import { test } from "node:test";
import assert from "node:assert/strict";

import {
  filterObligations,
  obligationFilterHref,
  ownerLabel,
  sortObligations,
  summarizeObligations,
  toCsv,
  type ObligationRow,
} from "./obligation-view";

function row(over: Partial<ObligationRow> & { id: string }): ObligationRow {
  return {
    code: `WURI-X-${over.id}`,
    title: `事項 ${over.id}`,
    stage: "CONSTRUCTION",
    risk: "GREEN",
    triggerType: "FIXED_DATE",
    status: "IN_PROGRESS",
    dueDate: null,
    actualDate: null,
    ownerUnit: null,
    ownerName: null,
    contractBasis: null,
    projectName: null,
    ...over,
  };
}

// ── ownerLabel ──────────────────────────────────────────────
test("ownerLabel 組合單位與責任人", () => {
  assert.equal(
    ownerLabel(row({ id: "1", ownerUnit: "資訊組", ownerName: "陳工程師" })),
    "資訊組 / 陳工程師",
  );
});

test("ownerLabel 只有其中之一時不留多餘分隔", () => {
  assert.equal(ownerLabel(row({ id: "1", ownerUnit: "水環組" })), "水環組");
  assert.equal(ownerLabel(row({ id: "2", ownerName: "王專案經理" })), "王專案經理");
  assert.equal(ownerLabel(row({ id: "3" })), "");
});

// ── summarizeObligations ────────────────────────────────────
test("統計卡分類計數；待審與待機關都算待外部", () => {
  const s = summarizeObligations([
    row({ id: "a", status: "NOT_STARTED" }),
    row({ id: "b", status: "IN_PROGRESS" }),
    row({ id: "c", status: "IN_PROGRESS" }),
    row({ id: "d", status: "PENDING_REVIEW" }),
    row({ id: "e", status: "PENDING_EXTERNAL" }),
    row({ id: "f", status: "OVERDUE" }),
  ]);
  assert.deepEqual(s, {
    notStarted: 1,
    inProgress: 2,
    pendingExternal: 2,
    overdue: 1,
    doneThisMonth: 0,
  });
});

test("本月完成只計實際完成日落在基準月份者", () => {
  const s = summarizeObligations(
    [
      row({ id: "a", status: "DONE", actualDate: "2026-07-03T00:00:00Z" }),
      row({ id: "b", status: "DONE", actualDate: "2026-07-28T00:00:00Z" }),
      row({ id: "c", status: "DONE", actualDate: "2026-06-30T00:00:00Z" }),
      row({ id: "d", status: "DONE", actualDate: "2026-08-01T00:00:00Z" }),
      // 完成但無實際日期，不計入
      row({ id: "e", status: "DONE" }),
    ],
    "2026-07-15T00:00:00Z",
  );
  assert.equal(s.doneThisMonth, 2);
});

test("空清單統計皆為 0", () => {
  assert.deepEqual(summarizeObligations([]), {
    notStarted: 0,
    inProgress: 0,
    pendingExternal: 0,
    overdue: 0,
    doneThisMonth: 0,
  });
});

// ── filterObligations ───────────────────────────────────────
const sample = [
  row({
    id: "1",
    code: "WURI-C-001",
    title: "完成雲端PMIS執行計畫書章節架構",
    stage: "CONCEPT_DESIGN",
    risk: "YELLOW",
    status: "IN_PROGRESS",
    ownerUnit: "資訊組",
    ownerName: "陳工程師",
    contractBasis: "契約第二條第八款",
  }),
  row({
    id: "2",
    code: "WURI-T-003",
    title: "確認統包招標文件全項審查清單",
    stage: "TENDER",
    risk: "GREEN",
    status: "IN_PROGRESS",
    ownerName: "王專案經理",
  }),
  row({
    id: "3",
    code: "WURI-S-007",
    title: "進度落後達5%時趕工計畫及週會機制",
    stage: "CONSTRUCTION",
    risk: "RED",
    status: "OVERDUE",
    ownerName: "專案經理",
  }),
];

test("篩選：階段", () => {
  const r = filterObligations(sample, { stage: "TENDER" });
  assert.deepEqual(r.map((x) => x.id), ["2"]);
});

test("篩選：風險與狀態可疊加", () => {
  assert.deepEqual(
    filterObligations(sample, { risk: "RED", status: "OVERDUE" }).map((x) => x.id),
    ["3"],
  );
  assert.equal(
    filterObligations(sample, { risk: "RED", status: "IN_PROGRESS" }).length,
    0,
  );
});

test("篩選：關鍵字比對名稱、編號、契約依據與責任人", () => {
  assert.deepEqual(
    filterObligations(sample, { keyword: "招標" }).map((x) => x.id),
    ["2"],
  );
  assert.deepEqual(
    filterObligations(sample, { keyword: "WURI-S" }).map((x) => x.id),
    ["3"],
  );
  assert.deepEqual(
    filterObligations(sample, { keyword: "第二條" }).map((x) => x.id),
    ["1"],
  );
  assert.deepEqual(
    filterObligations(sample, { keyword: "陳工程師" }).map((x) => x.id),
    ["1"],
  );
});

test("篩選：關鍵字不分大小寫且忽略前後空白", () => {
  assert.equal(filterObligations(sample, { keyword: "  wuri-c  " }).length, 1);
});

test('篩選："all" 與空字串視為不篩選', () => {
  assert.equal(
    filterObligations(sample, { stage: "all", risk: "", status: undefined }).length,
    3,
  );
});

test("篩選不改動輸入陣列", () => {
  const before = sample.map((x) => x.id);
  filterObligations(sample, { risk: "RED" });
  assert.deepEqual(sample.map((x) => x.id), before);
});

// ── sortObligations ─────────────────────────────────────────
test("排序：逾期最前，完成最後", () => {
  const r = sortObligations([
    row({ id: "done", status: "DONE" }),
    row({ id: "notStarted", status: "NOT_STARTED" }),
    row({ id: "overdue", status: "OVERDUE" }),
    row({ id: "inProgress", status: "IN_PROGRESS" }),
  ]);
  assert.deepEqual(r.map((x) => x.id), [
    "overdue",
    "inProgress",
    "notStarted",
    "done",
  ]);
});

test("排序：同狀態下期限近者優先，無期限排最後", () => {
  const r = sortObligations([
    row({ id: "none" }),
    row({ id: "late", dueDate: "2026-09-01T00:00:00Z" }),
    row({ id: "soon", dueDate: "2026-08-05T00:00:00Z" }),
  ]);
  assert.deepEqual(r.map((x) => x.id), ["soon", "late", "none"]);
});

test("排序不改動輸入陣列", () => {
  const input = [row({ id: "b", status: "DONE" }), row({ id: "a", status: "OVERDUE" })];
  const before = input.map((x) => x.id);
  sortObligations(input);
  assert.deepEqual(input.map((x) => x.id), before);
});

// ── toCsv ───────────────────────────────────────────────────
const labels = {
  stage: () => "施工監造",
  risk: () => "高",
  trigger: () => "條件觸發",
  status: () => "逾期",
};

test("toCsv 輸出表頭與資料列", () => {
  const csv = toCsv([sample[2]], labels);
  const lines = csv.split("\n");
  assert.ok(lines[0].startsWith("風險,管制編號,階段,履約事項"));
  assert.ok(lines[1].includes("WURI-S-007"));
  assert.equal(lines.length, 2);
});

test("toCsv 對含逗號與引號的欄位正確轉義", () => {
  const csv = toCsv(
    [row({ id: "x", title: '事項A,含逗號與"引號"', code: "C-1" })],
    labels,
  );
  const dataLine = csv.split("\n")[1];
  assert.ok(dataLine.includes('"事項A,含逗號與""引號"""'));
});

test("toCsv 空清單仍輸出表頭", () => {
  assert.equal(toCsv([], labels).split("\n").length, 1);
});

// ── 篩選與統計的組合（頁面實際使用路徑）─────────────────────
test("統計卡母數不受篩選影響，清單則依篩選收斂", () => {
  const all = [
    row({ id: "1", status: "OVERDUE", risk: "RED" }),
    row({ id: "2", status: "IN_PROGRESS", risk: "GREEN" }),
    row({ id: "3", status: "IN_PROGRESS", risk: "RED" }),
  ];
  const stats = summarizeObligations(all);
  const shown = sortObligations(filterObligations(all, { risk: "RED" }));
  assert.equal(stats.inProgress, 2);
  assert.deepEqual(shown.map((x) => x.id), ["1", "3"]);
});

test("排序後逾期在前，且篩選+排序不動到原陣列", () => {
  const input = [
    row({ id: "a", status: "IN_PROGRESS", dueDate: "2026-09-01T00:00:00Z" }),
    row({ id: "b", status: "OVERDUE", dueDate: "2026-10-01T00:00:00Z" }),
  ];
  const before = input.map((x) => x.id);
  const out = sortObligations(filterObligations(input, {}));
  assert.deepEqual(out.map((x) => x.id), ["b", "a"]);
  assert.deepEqual(input.map((x) => x.id), before);
});

test("toCsv 欄位順序與畫面表頭一致", () => {
  const head = toCsv([], labels).split("\n")[0].split(",");
  assert.deepEqual(head, [
    "風險",
    "管制編號",
    "階段",
    "履約事項",
    "責任單位/人",
    "觸發方式",
    "期限",
    "狀態",
    "契約依據",
  ]);
});

// ── obligationFilterHref ───────────────────────────────────
test("套用篩選時保留目前專案（否則搜尋一次就跳回全部專案）", () => {
  const out = obligationFilterHref("proj1", { q: "竣工" });
  const sp = new URLSearchParams(out.split("?")[1]);
  assert.equal(sp.get("project"), "proj1");
  assert.equal(sp.get("q"), "竣工");
});

test("全部專案時不寫入 project 參數", () => {
  for (const v of [null, undefined, "", "  ", "all"]) {
    assert.equal(obligationFilterHref(v, {}), "/obligations");
  }
});

test("all 與空白條件不寫入網址，避免無意義的長網址", () => {
  assert.equal(
    obligationFilterHref(null, { q: "  ", stage: "all", risk: "", status: "all" }),
    "/obligations",
  );
});

test("階段、風險、狀態逐一寫入", () => {
  const sp = new URLSearchParams(
    obligationFilterHref(null, {
      stage: "CONSTRUCTION",
      risk: "HIGH",
      status: "OPEN",
    }).split("?")[1],
  );
  assert.equal(sp.get("stage"), "CONSTRUCTION");
  assert.equal(sp.get("risk"), "HIGH");
  assert.equal(sp.get("status"), "OPEN");
});
