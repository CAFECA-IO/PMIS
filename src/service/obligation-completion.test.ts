import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_NAMED_BLOCKERS,
  blockReason,
  checkCompletion,
  clampProgress,
  completeConfirm,
  completeWorkItemConfirm,
  completionBlockedMessage,
  isDone,
  progressLabel,
  type WorkItemState,
} from "./obligation-completion";

const item = (over: Partial<WorkItemState> = {}): WorkItemState => ({
  id: over.id ?? "w1",
  name: over.name ?? "基樁施作",
  status: over.status ?? "COMPLETED",
  progress: over.progress ?? 100,
});

// ── 完成條件 ────────────────────────────────────────────────
test("全部工程分項完成時可以完成", () => {
  const c = checkCompletion([item({ id: "a" }), item({ id: "b" })]);
  assert.equal(c.ok, true);
  assert.equal(c.done, 2);
  assert.equal(c.total, 2);
  assert.deepEqual(c.blockers, []);
});

test("尚有未完成分項時不可完成，並指出是哪幾項", () => {
  const c = checkCompletion([
    item({ id: "a" }),
    item({ id: "b", name: "擋土支撐", status: "IN_PROGRESS", progress: 60 }),
  ]);
  assert.equal(c.ok, false);
  assert.equal(c.done, 1);
  assert.deepEqual(
    c.blockers.map((w) => w.name),
    ["擋土支撐"],
  );
});

test("沒有任何工程分項時允許完成（管理型事項本來就沒有分項）", () => {
  const c = checkCompletion([]);
  assert.equal(c.ok, true);
  assert.equal(c.total, 0);
  assert.equal(progressLabel(c), null, "沒有分項就不該顯示 0/0");
});

test("進度 100% 但狀態未完成仍算未完成（承辦人尚未確認）", () => {
  const c = checkCompletion([
    item({ id: "a", name: "路面舖築", status: "IN_PROGRESS", progress: 100 }),
  ]);
  assert.equal(c.ok, false, "只認狀態，避免兩套標準讓使用者不知道要改哪個");
  assert.equal(c.blockers[0].progress, 100);
});

test("延遲狀態同樣阻擋完成", () => {
  const c = checkCompletion([item({ status: "DELAYED", progress: 30 })]);
  assert.equal(c.ok, false);
});

test("未開始狀態同樣阻擋完成", () => {
  const c = checkCompletion([item({ status: "NOT_STARTED", progress: 0 })]);
  assert.equal(c.ok, false);
});

// ── 阻擋原因 ────────────────────────────────────────────────
test("可完成時沒有阻擋原因", () => {
  assert.equal(blockReason(checkCompletion([item()])), null);
});

test("卡住的分項少時逐一列名", () => {
  const c = checkCompletion([
    item({ id: "a", name: "擋土支撐", status: "IN_PROGRESS" }),
    item({ id: "b", name: "基樁施作", status: "DELAYED" }),
  ]);
  const reason = blockReason(c);
  assert.ok(reason);
  assert.match(reason, /擋土支撐、基樁施作/);
});

test("卡住的分項過多時只列前幾項並說明總數", () => {
  const many: WorkItemState[] = [];
  for (let i = 0; i < MAX_NAMED_BLOCKERS + 2; i++) {
    many.push(item({ id: `w${i}`, name: `分項${i}`, status: "IN_PROGRESS" }));
  }
  const reason = blockReason(checkCompletion(many));
  assert.ok(reason);
  assert.match(reason, new RegExp(`等 ${many.length} 項`));
  assert.ok(
    !reason.includes(`分項${MAX_NAMED_BLOCKERS}`),
    "超過上限的名稱不應全部列出",
  );
});

test("伺服器與畫面共用同一句拒絕訊息", () => {
  const c = checkCompletion([item({ name: "擋土支撐", status: "IN_PROGRESS" })]);
  const msg = completionBlockedMessage(c);
  assert.match(msg, /擋土支撐/);
  assert.match(msg, /請先完成所有歸屬的工程分項/);
});

// ── 進度說明 ────────────────────────────────────────────────
test("進度說明呈現已完成與總數", () => {
  const c = checkCompletion([
    item({ id: "a" }),
    item({ id: "b", status: "IN_PROGRESS" }),
    item({ id: "c", status: "NOT_STARTED" }),
  ]);
  assert.equal(progressLabel(c), "工程分項 1/3 已完成");
});

// ── 確認文案 ────────────────────────────────────────────────
test("完成確認說出連帶影響，不只是問要不要", () => {
  const copy = completeConfirm("提報施工計畫書", checkCompletion([item()]));
  assert.match(copy.title, /完成「提報施工計畫書」？/);
  assert.match(copy.description, /實際完成日/);
  assert.match(copy.description, /進度與預警/, "此動作會進到上捲與預警，須先說明");
});

test("有分項與無分項的確認文案不同（使用者要知道憑據是什麼）", () => {
  const withItems = completeConfirm("甲", checkCompletion([item(), item({ id: "b" })]));
  const without = completeConfirm("乙", checkCompletion([]));
  assert.match(withItems.description, /2 項工程分項均已完成/);
  assert.match(without.description, /沒有歸屬的工程分項/);
});

test("完成工程分項的確認說明會連帶改百分比與完工日", () => {
  const copy = completeWorkItemConfirm("基樁施作");
  assert.match(copy.title, /基樁施作/);
  assert.match(copy.description, /100%/);
  assert.match(copy.description, /實際完工日/);
});

// ── 其他 ────────────────────────────────────────────────────
test("完成狀態的判定", () => {
  assert.equal(isDone("DONE"), true);
  assert.equal(isDone("IN_PROGRESS"), false);
  assert.equal(isDone("OVERDUE"), false);
});

test("完成百分比收斂到 0 至 100 的整數", () => {
  assert.equal(clampProgress("150"), 100);
  assert.equal(clampProgress(-20), 0);
  assert.equal(clampProgress("60"), 60);
  assert.equal(clampProgress("60.6"), 61);
  assert.equal(clampProgress("abc"), 0, "非數字視為 0，不可寫入 NaN");
  assert.equal(clampProgress(undefined), 0);
  assert.equal(clampProgress(""), 0);
});
