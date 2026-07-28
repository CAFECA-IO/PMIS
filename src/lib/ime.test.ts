import { test } from "node:test";
import assert from "node:assert/strict";

import { shouldSendOnEnter } from "./ime";

const enter = { key: "Enter", shiftKey: false };

test("純 Enter（未使用輸入法）應送出", () => {
  assert.equal(shouldSendOnEnter(enter, false), true);
});

test("IME 選字中：composing 旗標為 true 時不可送出", () => {
  assert.equal(shouldSendOnEnter(enter, true), false);
});

test("IME 選字中：event.isComposing 為 true 時不可送出", () => {
  assert.equal(
    shouldSendOnEnter({ ...enter, isComposing: true }, false),
    false,
  );
});

test("IME 選字中：Safari/舊 Chrome keyCode 229 不可送出", () => {
  assert.equal(shouldSendOnEnter({ ...enter, keyCode: 229 }, false), false);
});

test("Shift+Enter 為換行，不送出", () => {
  assert.equal(shouldSendOnEnter({ key: "Enter", shiftKey: true }, false), false);
});

test("其他按鍵不送出", () => {
  for (const key of ["a", "Escape", "Tab", "Process"]) {
    assert.equal(shouldSendOnEnter({ key, shiftKey: false }, false), false);
  }
});

test("選字結束後（composing 已復位）Enter 應可送出", () => {
  // 模擬：compositionstart -> 選字 Enter -> compositionend -> 再按 Enter
  let composing = false;
  composing = true; // compositionstart
  assert.equal(shouldSendOnEnter(enter, composing), false, "選字中不送出");
  composing = false; // compositionend
  assert.equal(shouldSendOnEnter(enter, composing), true, "選字結束後可送出");
});
