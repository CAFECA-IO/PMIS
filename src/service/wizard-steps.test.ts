import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STEP_ORDER,
  applyOwnerPatches,
  applyProgress,
  countFilled,
  countWithOwner,
  describeStep,
  failedSteps,
  initialProgress,
  isSettled,
  mergeFields,
  mergeObligations,
  mergeWorkItems,
  stepLabel,
} from "./wizard-steps";
import type { WizardObligation, WizardWorkItem } from "./faith.service";

const ob = (over: Partial<WizardObligation> & { title: string }): WizardObligation => ({
  ...over,
});

// ── 步驟定義與進度 ──────────────────────────────────────────
test("步驟順序：前置資料先於依賴它的段落", () => {
  assert.deepEqual(STEP_ORDER, ["profile", "obligations", "owners", "workItems"]);
  assert.ok(
    STEP_ORDER.indexOf("obligations") < STEP_ORDER.indexOf("owners"),
    "責任分工需在履約事項之後",
  );
  assert.ok(
    STEP_ORDER.indexOf("obligations") < STEP_ORDER.indexOf("workItems"),
    "工程分項需在履約事項之後",
  );
});

test("初始進度為全部待處理", () => {
  const p = initialProgress();
  assert.equal(p.length, 4);
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
  p = applyProgress(p, { id: "owners", state: "failed", error: "x" });
  assert.equal(isSettled(p), true, "失敗也算結束");
  assert.deepEqual(failedSteps(p), ["owners"]);
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
    describeStep({ id: "owners", state: "failed", error: "逾時" }),
    "責任分工與契約依據解析失敗：逾時",
  );
  assert.match(describeStep({ id: "workItems", state: "skipped" }), /略過/);
  assert.equal(stepLabel("workItems"), "工程分項");
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

// ── applyOwnerPatches ───────────────────────────────────────
test("applyOwnerPatches 回填空白的責任欄位", () => {
  const out = applyOwnerPatches(
    [ob({ title: "連續壁完成" }), ob({ title: "開工" })],
    [
      { title: "連續壁完成", ownerUnit: "工務組", ownerName: "林監造", contractBasis: "契約第五條" },
    ],
  );
  const target = out.find((o) => o.title === "連續壁完成")!;
  assert.equal(target.ownerUnit, "工務組");
  assert.equal(target.contractBasis, "契約第五條");
  assert.equal(out.find((o) => o.title === "開工")!.ownerUnit, undefined);
});

test("applyOwnerPatches 不覆蓋已有的責任資料", () => {
  const out = applyOwnerPatches(
    [ob({ title: "開工", ownerUnit: "使用者填的單位" })],
    [{ title: "開工", ownerUnit: "AI 單位", ownerName: "AI 人員" }],
  );
  assert.equal(out[0].ownerUnit, "使用者填的單位");
  assert.equal(out[0].ownerName, "AI 人員", "原本為空者仍會填入");
});

test("applyOwnerPatches 忽略對應不到的名稱（不新建事項）", () => {
  const out = applyOwnerPatches(
    [ob({ title: "開工" })],
    [{ title: "不存在的事項", ownerUnit: "X" }],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].ownerUnit, undefined);
});

test("countWithOwner 計算已有分工的事項數", () => {
  assert.equal(
    countWithOwner([
      ob({ title: "a", ownerUnit: "工務組" }),
      ob({ title: "b", ownerName: "林監造" }),
      ob({ title: "c" }),
      ob({ title: "d", ownerUnit: "   " }),
    ]),
    2,
  );
});

// ── mergeWorkItems ──────────────────────────────────────────
const wi = (over: Partial<WizardWorkItem> & { name: string }): WizardWorkItem => ({
  ...over,
});

test("mergeWorkItems 去重並保留可對應的履約事項", () => {
  const out = mergeWorkItems(
    [],
    [wi({ name: "連續壁施工", obligation: "連續壁完成" }), wi({ name: "連續壁施工" })],
    ["連續壁完成"],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].obligation, "連續壁完成");
});

test("mergeWorkItems 對應不到履約事項時清空該關聯", () => {
  const out = mergeWorkItems(
    [],
    [wi({ name: "開挖", obligation: "不存在" })],
    ["連續壁完成"],
  );
  assert.equal(out[0].obligation, undefined);
});

test("mergeWorkItems 不與既有項目重複", () => {
  const out = mergeWorkItems([wi({ name: "開挖" })], [wi({ name: "開挖" })], []);
  assert.equal(out.length, 1);
});
