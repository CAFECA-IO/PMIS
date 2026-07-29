import { test } from "node:test";
import assert from "node:assert/strict";

import * as faith from "@/service/faith.service";
import {
  MIN_THINKING_BUDGET,
  WIZARD_MAX_TOKENS,
  thinkingBudgetFor,
} from "@/service/faith.service";
import { runExtraction } from "@/service/wizardExtract.service";

/**
 * 重現 2026-07-28 的真實故障。
 *
 * 當時「履約事項」與「工程分項」兩段各花約 30 秒、只吐出不到 600 字且 JSON
 * 不完整（思考 token 吃光 8192 的預算）。截斷的 JSON 被 parseJsonLoose 修補成
 * 合法物件，於是被呈現為「成功解析，但沒有任何履約事項」——使用者因此誤以為
 * 契約沒有訂期限。本檔確保這種情況一律明確失敗。
 */

/** 取自紀錄的真實回應：在第 8 項 scopeItems 的字串中途被切斷。 */
const TRUNCATED = `{
  "scopeItems": [
    { "code": "(一)1", "title": "審查（閱）或查核興建執行計畫書" },
    { "code": "(一)1", "title": "審查（閱）或查核施工計畫、品質計畫及職業安全計畫" },
    { "code": "(一)1", "title": "審查（閱）或查核細部設計圖說" },
    { "code": "(一)1", "title": "審查（閱）或查核整體維護計畫" },
    { "code": "(一)1", "title": "審查（閱）或查核環保及交通維持計畫" },
    { "code": "(一)1", "title": "審查（閱）或查核管線遷移計畫" },
    { "code": "(一)1", "title": "審查（閱）或查核工程變更案件" },
    {
      "code": "(一)1",
      "title": "審查（閱）或查核年度`;

function stub(opts: {
  text: string;
  finishReason?: string;
  thoughts?: number;
}) {
  process.env.AI_KEY = "test-key";
  const original = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_u: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: opts.text }] },
            finishReason: opts.finishReason ?? "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 12000,
          candidatesTokenCount: 190,
          thoughtsTokenCount: opts.thoughts ?? 0,
          totalTokenCount: 12190 + (opts.thoughts ?? 0),
        },
      }),
    };
  }) as unknown as typeof fetch;
  return { bodies, restore: () => { globalThis.fetch = original; } };
}

/** 解析一定要有契約全文；沒有文件時三段會依設計略過（見 wizard-source）。 */
const DOC = "檔名：契約.docx\n第二條 履約標的…";

// ── 截斷必須明確失敗 ────────────────────────────────────────
test("輸出被長度上限截斷時拋錯，不得回報為「成功但沒資料」", async () => {
  const s = stub({
    text: TRUNCATED,
    finishReason: "MAX_TOKENS",
    thoughts: 7600,
  });
  try {
    await assert.rejects(
      () => faith.extractObligations({ messages: [{ role: "user", text: "解析" }] }),
      /截斷/,
      "必須因截斷而失敗",
    );
  } finally {
    s.restore();
  }
});

test("錯誤訊息點出思考用量與輸出上限，讓人能判斷該調哪個值", async () => {
  const s = stub({ text: TRUNCATED, finishReason: "MAX_TOKENS", thoughts: 7600 });
  try {
    await faith.extractObligations({ messages: [] });
    assert.fail("應該拋錯");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert.match(msg, /思考用了 7600 tokens/);
    assert.match(msg, /輸出上限/);
    assert.match(msg, /請重試/, "應告知可重試");
  } finally {
    s.restore();
  }
});

test("階段一被截斷時標為 failed，且下游不會被誤報為「沒有資料」", async () => {
  const s = stub({ text: TRUNCATED, finishReason: "MAX_TOKENS", thoughts: 7600 });
  try {
    const events = [];
    for await (const e of runExtraction({ messages: [], documentText: DOC })) events.push(e);

    const scope = events.find(
      (e) =>
        e.type === "status" &&
        "step" in e &&
        e.step === "scope" &&
        "state" in e &&
        e.state === "failed",
    ) as { error?: string } | undefined;
    assert.ok(scope, "階段一應標為 failed");
    assert.match(scope!.error ?? "", /截斷/);

    // 關鍵：任何段落都不得出現「成功但 0 項」
    const doneAny = events.find(
      (e) => e.type === "status" && "state" in e && e.state === "done",
    );
    assert.equal(doneAny, undefined, "截斷不可回報為完成");

    // 下游因缺少上游輸入而略過，不是「查無資料」
    const ob = events.find(
      (e) =>
        e.type === "status" &&
        "step" in e &&
        e.step === "obligations" &&
        "state" in e &&
        e.state === "skipped",
    ) as { reason?: string } | undefined;
    assert.ok(ob, "履約事項應標為略過");
    assert.match(ob!.reason ?? "", /履約標的/);
  } finally {
    s.restore();
  }
});

test("finishReason 為 STOP 時正常回傳，不受影響", async () => {
  const s = stub({
    text: JSON.stringify({
      obligations: [{ title: "每月10日前提送月報", dueDate: "2026-08-10" }],
    }),
    finishReason: "STOP",
    thoughts: 900,
  });
  try {
    const r = await faith.extractObligations({ messages: [] });
    assert.equal(r.data.length, 1);
  } finally {
    s.restore();
  }
});

// ── 思考預算 ────────────────────────────────────────────────
test("每次呼叫都明確送出 thinkingConfig，不依賴模型預設", async () => {
  const s = stub({ text: JSON.stringify({ obligations: [] }) });
  try {
    await faith.extractObligations({ messages: [] });
    const cfg = s.bodies[0].generationConfig as {
      thinkingConfig?: { thinkingBudget?: number };
      maxOutputTokens?: number;
    };
    assert.ok(cfg.thinkingConfig, "未送出 thinkingConfig 就等於接受預設的動態預算");
    assert.equal(cfg.maxOutputTokens, WIZARD_MAX_TOKENS);
    assert.equal(
      cfg.thinkingConfig!.thinkingBudget,
      thinkingBudgetFor(WIZARD_MAX_TOKENS),
    );
  } finally {
    s.restore();
  }
});

test("思考預算為輸出上限的四分之一，其餘留給實際輸出", () => {
  assert.equal(thinkingBudgetFor(24576), 6144);
  assert.equal(thinkingBudgetFor(4096), 1024);
});

test("預算極小時仍保留下限，不致完全無法推理", () => {
  assert.equal(thinkingBudgetFor(512), MIN_THINKING_BUDGET);
  assert.equal(thinkingBudgetFor(0), MIN_THINKING_BUDGET);
});

test("四段解析的輸出上限已高於曾失敗的 8192", () => {
  assert.ok(
    WIZARD_MAX_TOKENS > 8192,
    "8192 已證實不足（思考佔用同一預算）",
  );
  // 扣掉思考後仍須留下遠超過 8192 的輸出空間
  assert.ok(WIZARD_MAX_TOKENS - thinkingBudgetFor(WIZARD_MAX_TOKENS) > 16000);
});
