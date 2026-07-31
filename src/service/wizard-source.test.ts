import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeSource,
  hasPriorRun,
  requiresDocument,
  requiresScope,
  resolveScope,
  skipReason,
} from "./wizard-source";

// ── requiresDocument ────────────────────────────────────────
test("除基本資料外的段落都依賴契約", () => {
  assert.equal(requiresDocument("scope"), true);
  assert.equal(requiresDocument("obligations"), true);
  assert.equal(
    requiresDocument("profile"),
    false,
    "基本資料可由使用者口述補齊",
  );
});

// ── resolveScope ────────────────────────────────────────────
test("補資料的後續送出只跑基本資料（本次修正的核心）", () => {
  assert.deepEqual(
    resolveScope({ hasAttachment: false, hasPriorRun: true }),
    ["profile"],
  );
});

test("附上新檔案時跑完整流程", () => {
  assert.deepEqual(
    resolveScope({ hasAttachment: true, hasPriorRun: true }),
    ["profile", "scope", "obligations"],
  );
});

test("首次解析（尚無成果）即使只有文字也跑完整流程", () => {
  assert.equal(
    resolveScope({ hasAttachment: false, hasPriorRun: false }).length,
    3,
  );
});

test("明確指定段落時一律照辦，優先於其他規則", () => {
  assert.deepEqual(
    resolveScope({
      only: ["obligations"],
      hasAttachment: false,
      hasPriorRun: true,
    }),
    ["obligations"],
  );
  // 即使附了檔案，指定單段也不擴大範圍
  assert.deepEqual(
    resolveScope({ only: ["scope"], hasAttachment: true, hasPriorRun: true }),
    ["scope"],
  );
});

test("指定的段落順序一律正規化，不受呼叫端傳入順序影響", () => {
  assert.deepEqual(
    resolveScope({
      only: ["obligations", "profile", "scope"],
      hasAttachment: false,
      hasPriorRun: true,
    }),
    ["profile", "scope", "obligations"],
  );
});

test("only 含未知值時忽略該值，不致跑出不存在的段落", () => {
  assert.deepEqual(
    resolveScope({
      // @ts-expect-error 刻意傳入錯字，模擬呼叫端寫錯
      only: ["obligation", "profile"],
      hasAttachment: false,
      hasPriorRun: true,
    }),
    ["profile"],
  );
});

test("only 為空陣列視為未指定，走一般規則", () => {
  assert.deepEqual(
    resolveScope({ only: [], hasAttachment: false, hasPriorRun: true }),
    ["profile"],
  );
});

// ── hasPriorRun ─────────────────────────────────────────────
test("草稿有任何內容即視為已解析過", () => {
  assert.equal(hasPriorRun({ fields: { name: "某工程" } }), true);
  assert.equal(hasPriorRun({ obligations: [{}] }), true);
  assert.equal(hasPriorRun({ workItems: [{}] }), true);
  assert.equal(hasPriorRun({ scopeItems: [{}] }), true);
});

test("空草稿與只有空字串欄位都不算解析過", () => {
  assert.equal(hasPriorRun({}), false);
  assert.equal(hasPriorRun({ fields: {} }), false);
  assert.equal(hasPriorRun({ fields: { name: "", code: "   " } }), false);
  assert.equal(hasPriorRun({ obligations: [], workItems: [] }), false);
});

// ── skipReason ──────────────────────────────────────────────
test("有新附件時不略過", () => {
  assert.equal(
    skipReason("obligations", { hasAttachment: true, hasArchivedText: false }),
    null,
  );
});

test("由歸檔重讀到契約時不略過（重試因此可用）", () => {
  assert.equal(
    skipReason("obligations", { hasAttachment: false, hasArchivedText: true }),
    null,
  );
});

test("完全沒有契約時，各段皆略過並說明補救方式", () => {
  for (const step of ["scope", "obligations"] as const) {
    const reason = skipReason(step, {
      hasAttachment: false,
      hasArchivedText: false,
    });
    assert.ok(reason, `${step} 應被略過`);
    assert.match(reason!, /缺少契約文件/);
    assert.match(reason!, /重新上傳/, "只說略過而不說怎麼辦，使用者只會反覆重試");
    assert.match(reason!, /臆測/, "應說明為何不硬跑");
  }
});

test("基本資料段永不因缺文件而略過", () => {
  assert.equal(
    skipReason("profile", { hasAttachment: false, hasArchivedText: false }),
    null,
  );
});

// ── describeSource ──────────────────────────────────────────
test("沿用歸檔文件時告知使用者來源", () => {
  assert.match(
    describeSource({ hasAttachment: false, hasArchivedText: true }) ?? "",
    /沿用先前上傳/,
  );
});

test("本次有附件或完全無文件時不需額外說明", () => {
  assert.equal(
    describeSource({ hasAttachment: true, hasArchivedText: false }),
    null,
  );
  assert.equal(
    describeSource({ hasAttachment: false, hasArchivedText: false }),
    null,
  );
});

// ── requiresScope：階段化的上游依賴 ──────────────────────────
test("推導型段落需要履約標的作為上游輸入", () => {
  assert.equal(requiresScope("obligations"), true);
});

test("照抄型與不相關的段落不需要履約標的", () => {
  assert.equal(requiresScope("scope"), false, "履約標的自己就是產生者");
  assert.equal(requiresScope("profile"), false);
});
