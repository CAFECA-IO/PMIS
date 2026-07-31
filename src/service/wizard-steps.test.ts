import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STEP_ORDER,
  applyProgress,
  countFilled,
  scopeNote,
  describeStep,
  failedSteps,
  initialProgress,
  isSettled,
  mergeFields,
  mergeObligations,
  stepLabel,
} from "./wizard-steps";
import type { WizardObligation } from "./faith.service";

const ob = (over: Partial<WizardObligation> & { title: string }): WizardObligation => ({
  ...over,
});

// ── 步驟定義與進度 ──────────────────────────────────────────
test("步驟順序：前置資料先於依賴它的段落", () => {
  assert.ok(
    STEP_ORDER.indexOf("scope") < STEP_ORDER.indexOf("obligations"),
    "履約事項由履約標的推導，標的必須先讀出",
  );
});

test("建置階段止於履約事項的名稱與期限", () => {
  /*
    每一段被拿掉都是同一個理由：那件事在簽約當下判不準。
    工程分項要有數量、單價與預定起訖（來自預算書與施工排程）；
    責任分工要有組織分工；觸發方式要對照工期表；試運轉要看驗收條件。
    在建置頁逼使用者一次決定這些，只會得到一批看似已確認的猜測。
  */
  assert.deepEqual(STEP_ORDER, ["profile", "scope", "obligations"]);
});

test("初始進度為全部待處理", () => {
  const p = initialProgress();
  assert.equal(p.length, 3);
  assert.ok(p.every((x) => x.state === "pending"));
});

test("applyProgress 更新指定段落且不改動輸入", () => {
  const before = initialProgress();
  const after = applyProgress(before, { id: "obligations", state: "done", count: 7 });
  assert.equal(after.find((p) => p.id === "obligations")?.state, "done");
  assert.equal(after.find((p) => p.id === "obligations")?.count, 7);
  assert.equal(
    before.find((p) => p.id === "obligations")?.state,
    "pending",
    "原陣列不應被改動",
  );
});

test("applyProgress 保留既有欄位（僅覆寫傳入的鍵）", () => {
  let p = initialProgress();
  p = applyProgress(p, { id: "profile", state: "done", count: 9, total: 11 });
  p = applyProgress(p, { id: "profile", state: "failed", error: "逾時" });
  const s = p.find((x) => x.id === "profile")!;
  assert.equal(s.state, "failed");
  assert.equal(s.error, "逾時");
  assert.equal(s.total, 11, "total 未傳入時應保留");
});

test("isSettled 與 failedSteps", () => {
  let p = initialProgress();
  assert.equal(isSettled(p), false);
  for (const id of STEP_ORDER) p = applyProgress(p, { id, state: "done" });
  assert.equal(isSettled(p), true);
  p = applyProgress(p, { id: "obligations", state: "failed", error: "x" });
  assert.equal(isSettled(p), true, "失敗也算結束");
  assert.deepEqual(failedSteps(p), ["obligations"]);
});

test("describeStep 對各狀態產生可讀敘述", () => {
  assert.match(describeStep({ id: "profile", state: "running" }), /正在解析專案基本資料/);
  assert.equal(
    describeStep({ id: "profile", state: "done", count: 9, total: 11 }),
    "專案基本資料完成（9/11 欄）",
  );
  assert.equal(
    describeStep({ id: "obligations", state: "done", count: 7 }),
    "履約事項完成（7 項）",
  );
  assert.equal(
    describeStep({ id: "scope", state: "failed", error: "逾時" }),
    "契約履約標的解析失敗：逾時",
  );
  assert.match(describeStep({ id: "obligations", state: "skipped" }), /略過/);
  assert.equal(stepLabel("scope"), "契約履約標的");
});

// ── mergeFields ─────────────────────────────────────────────
test("mergeFields 不覆蓋使用者已填的值", () => {
  const out = mergeFields(
    { code: "USER-001", name: "" },
    { code: "AI-999", name: "AI 判讀名稱", client: "某機關" },
  );
  assert.equal(out.code, "USER-001", "已填欄位保留使用者的值");
  assert.equal(out.name, "AI 判讀名稱");
  assert.equal(out.client, "某機關");
});

test("mergeFields 忽略空值與 undefined 輸入", () => {
  const base = { code: "A" };
  assert.deepEqual(mergeFields(base, undefined), base);
  assert.deepEqual(mergeFields(base, { name: "" }), base);
});

test("countFilled 計算已填欄位數", () => {
  assert.equal(countFilled({ code: "A", name: "B" }, ["code", "name", "client"]), 2);
  assert.equal(countFilled({ code: "", name: "B" }, ["code", "name"]), 1);
});

// ── mergeObligations ────────────────────────────────────────
test("mergeObligations 以名稱去重", () => {
  const out = mergeObligations(
    [ob({ title: "開工" })],
    [ob({ title: "開工" }), ob({ title: "連續壁完成" })],
  );
  assert.deepEqual(out.map((o) => o.title), ["開工", "連續壁完成"]);
});

test("mergeObligations 忽略無名稱項目與空輸入", () => {
  const base = [ob({ title: "開工" })];
  assert.equal(mergeObligations(base, [ob({ title: "  " })]).length, 1);
  assert.equal(mergeObligations(base, undefined).length, 1);
});

// ── scopeNote：履約標的的判讀狀況 ──────────────────────────────
test("正常情況報出履約標的與應辦事項的項數", () => {
  const s = scopeNote(12, 23, "已逐條讀完履約標的");
  assert.match(s, /讀出履約標的 12 項工作/);
  assert.match(s, /推導出 23 項應辦事項/);
  assert.match(s, /已逐條讀完履約標的/, "模型說明應接在後面");
});

test("沒讀到履約標的卻生出事項時，明確要求核對契約", () => {
  const s = scopeNote(0, 5, undefined);
  assert.match(s, /未能.*讀出「履約標的」/);
  assert.match(s, /5 項應辦事項請逐項核對契約/);
});

test("沒讀到履約標的也沒有事項時，說明因果", () => {
  const s = scopeNote(0, 0, undefined);
  assert.match(s, /未能.*讀出「履約標的」/);
  assert.match(s, /沒有可推導的應辦事項/);
});

test("應辦事項少於履約標的項數時提醒可能漏讀", () => {
  const s = scopeNote(20, 6, undefined);
  assert.match(s, /少於履約標的項數/);
  assert.match(s, /漏讀/);
});

test("讀到履約標的但完全沒有期限性事項，不謊稱推導成功", () => {
  const s = scopeNote(8, 0, undefined);
  assert.match(s, /讀出履約標的 8 項工作/);
  assert.match(s, /沒有訂明期限/);
});

test("事項數等於或多於履約標的項數時不加提醒", () => {
  assert.doesNotMatch(scopeNote(10, 10, undefined), /少於/);
  assert.doesNotMatch(scopeNote(10, 25, undefined), /少於/);
});

test("模型未提供說明時不留下多餘空白", () => {
  const s = scopeNote(3, 4, "   ");
  assert.equal(s, s.trim());
  assert.doesNotMatch(s, /\s\s/);
});
