import { test } from "node:test";
import assert from "node:assert/strict";

import { lastUserText } from "./faithArchive";

test("lastUserText 取最後一則有內容的使用者訊息", () => {
  assert.equal(
    lastUserText([
      { role: "user", text: "第一句" },
      { role: "assistant", text: "回覆" },
      { role: "user", text: "請判讀這份契約" },
    ]),
    "請判讀這份契約",
  );
});

test("lastUserText 跳過空白訊息（僅附件無文字時）", () => {
  assert.equal(
    lastUserText([
      { role: "user", text: "前面說過的需求" },
      { role: "user", text: "   " },
    ]),
    "前面說過的需求",
  );
});

test("lastUserText 無使用者訊息或輸入異常時回 null", () => {
  assert.equal(lastUserText([{ role: "assistant", text: "您好" }]), null);
  assert.equal(lastUserText([]), null);
  assert.equal(lastUserText(undefined), null);
});
