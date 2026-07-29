import { test } from "node:test";
import assert from "node:assert/strict";

import * as faith from "@/service/faith.service";
import {
  BUSY_MESSAGE,
  FAILED_MESSAGE,
  FaithError,
  busy,
  classifyStatus,
  failed,
  looksBusy,
  toFaithError,
} from "./faith-error";

// ── 分類 ────────────────────────────────────────────────────
test("額度與速率限制屬忙線（重試有意義）", () => {
  assert.equal(classifyStatus(429), "busy");
});

test("伺服器端 5xx 屬忙線", () => {
  for (const s of [500, 502, 503, 504]) {
    assert.equal(classifyStatus(s), "busy", `${s} 應為忙線`);
  }
});

test("4xx 屬處理異常（請求本身有問題，重試不會變好）", () => {
  for (const s of [400, 401, 403, 404, 415]) {
    assert.equal(classifyStatus(s), "failed", `${s} 應為異常`);
  }
});

test("錯誤文字含暫時性字樣時視為忙線", () => {
  for (const t of [
    "The model is overloaded. Please try again later.",
    "RESOURCE_EXHAUSTED",
    "Quota exceeded for quota metric",
    "Rate limit reached",
    "deadline exceeded",
    "socket timeout",
  ]) {
    assert.equal(looksBusy(t), true, `「${t}」應判為忙線`);
  }
});

test("一般錯誤文字不誤判為忙線", () => {
  assert.equal(looksBusy("Invalid JSON payload received"), false);
  assert.equal(looksBusy("API key not valid"), false);
  assert.equal(looksBusy(""), false);
  assert.equal(looksBusy(null), false);
});

// ── 訊息內容 ────────────────────────────────────────────────
test("兩種對外訊息固定且可辨識", () => {
  assert.equal(busy().message, BUSY_MESSAGE);
  assert.equal(failed().message, FAILED_MESSAGE);
  assert.match(BUSY_MESSAGE, /忙線/);
  assert.match(FAILED_MESSAGE, /處理異常/);
});

test("建議接在制式訊息之後，兩者都看得到", () => {
  const e = failed("請縮減文件範圍。");
  assert.ok(e.message.startsWith(FAILED_MESSAGE));
  assert.match(e.message, /請縮減文件範圍/);
});

test("原始細節放在 detail，不進入對外訊息", () => {
  const e = failed("請重試。", "Gemini API 錯誤（400）：invalid schema");
  assert.doesNotMatch(e.message, /400/);
  assert.doesNotMatch(e.message, /schema/);
  assert.match(e.detail ?? "", /invalid schema/);
});

// ── 正規化 ──────────────────────────────────────────────────
test("已是 FaithError 者原樣回傳，保留分類與建議", () => {
  const original = busy("稍後再試。", "原始細節");
  const out = toFaithError(original);
  assert.equal(out, original);
  assert.equal(out.kind, "busy");
});

test("一般 Error 收斂為處理異常，原訊息移入 detail", () => {
  const out = toFaithError(new Error("TypeError: undefined is not a function"));
  assert.equal(out.kind, "failed");
  assert.equal(out.message, FAILED_MESSAGE);
  assert.match(out.detail ?? "", /undefined is not a function/);
});

test("第三方錯誤若帶暫時性字樣仍判為忙線", () => {
  const out = toFaithError(new Error("fetch failed: ETIMEDOUT"));
  assert.equal(out.kind, "busy");
});

test("非 Error 的拋出值也不會讓正規化爆掉", () => {
  assert.equal(toFaithError("字串錯誤").kind, "failed");
  assert.equal(toFaithError(null).message, FAILED_MESSAGE);
  assert.equal(toFaithError(undefined).kind, "failed");
});

// ── 透過真實閘道驗證：原始細節不外流 ─────────────────────────
function stubStatus(status: number, detail: string) {
  process.env.AI_KEY = "test-key";
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: false,
    status,
    json: async () => ({ error: { message: detail } }),
  })) as unknown as typeof fetch;
  return { restore: () => { globalThis.fetch = original; } };
}

test("429 經閘道後對外只說忙線，原始訊息留在 detail", async () => {
  const s = stubStatus(429, "Quota exceeded for quota metric 'Requests'");
  try {
    await faith.extractScopeItems({ messages: [] });
    assert.fail("應該拋錯");
  } catch (e) {
    const err = e as FaithError;
    assert.equal(err.kind, "busy");
    assert.equal(err.message, BUSY_MESSAGE);
    assert.doesNotMatch(err.message, /Quota/);
    assert.doesNotMatch(err.message, /429/);
    assert.match(err.detail ?? "", /Quota exceeded/);
  } finally {
    s.restore();
  }
});

test("400 經閘道後對外只說處理異常，schema 細節不外流", async () => {
  const s = stubStatus(400, "response_schema cannot be empty");
  try {
    await faith.extractScopeItems({ messages: [] });
    assert.fail("應該拋錯");
  } catch (e) {
    const err = e as FaithError;
    assert.equal(err.kind, "failed");
    assert.doesNotMatch(err.message, /schema/);
    assert.match(err.detail ?? "", /response_schema/);
  } finally {
    s.restore();
  }
});

test("500 但訊息說 overloaded：仍為忙線", async () => {
  const s = stubStatus(500, "The model is overloaded.");
  try {
    await faith.extractScopeItems({ messages: [] });
    assert.fail("應該拋錯");
  } catch (e) {
    assert.equal((e as FaithError).kind, "busy");
  } finally {
    s.restore();
  }
});

test("連線失敗（fetch 直接拋出）視為忙線", async () => {
  process.env.AI_KEY = "test-key";
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED 127.0.0.1:443");
  }) as unknown as typeof fetch;
  try {
    await faith.extractScopeItems({ messages: [] });
    assert.fail("應該拋錯");
  } catch (e) {
    const err = e as FaithError;
    assert.equal(err.kind, "busy");
    assert.doesNotMatch(err.message, /ECONNREFUSED/, "IP 與埠號不得外流");
    assert.match(err.detail ?? "", /ECONNREFUSED/);
  } finally {
    globalThis.fetch = original;
  }
});

test("未設定金鑰時不把環境變數名稱丟到畫面", async () => {
  const original = process.env.AI_KEY;
  delete process.env.AI_KEY;
  try {
    await faith.extractScopeItems({ messages: [] });
    assert.fail("應該拋錯");
  } catch (e) {
    const err = e as FaithError;
    assert.equal(err.kind, "failed");
    assert.doesNotMatch(err.message, /AI_KEY/);
    assert.match(err.message, /系統管理者/, "應告訴使用者該找誰");
    assert.match(err.detail ?? "", /AI_KEY/);
  } finally {
    if (original !== undefined) process.env.AI_KEY = original;
  }
});

test("所有對外訊息都以兩種制式語意其中之一開頭", () => {
  const samples = [
    toFaithError(new Error("random")),
    busy(),
    failed("附帶建議。"),
    toFaithError("字串"),
  ];
  for (const e of samples) {
    assert.ok(
      e.message.startsWith(BUSY_MESSAGE) || e.message.startsWith(FAILED_MESSAGE),
      `未收斂：${e.message}`,
    );
  }
});
