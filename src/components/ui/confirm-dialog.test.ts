import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 刪除確認框的版面規則。
 *
 * 這些缺陷都只有算出版面才看得見，而對話框的內容只在開啟後才存在 ——
 * 沒有 DOM 的環境渲染不到。故以原始碼守住，並把「為什麼」寫在訊息裡。
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const source = readFileSync(
  path.join(ROOT, "src/components/ui/confirm-dialog.tsx"),
  "utf8",
);
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

test("提示文字不得把有內距的行內元素塞在行內 label 裡", () => {
  /*
    原本的破版：灰底的 DELETE 是 <span> 加 py-0.5，而 label 是行內元素，
    那個背景框會撐出行高之外，看起來像壓到隔壁的字。
  */
  const label = code.slice(code.indexOf("<label"), code.indexOf("</label>"));
  assert.match(label, /flex flex-wrap items-center/, "label 需由 flex 決定對齊");
  assert.match(label, /htmlFor=\{id\}/, "點文字要能聚焦到欄位");
});

test("不得以 requireText 當 placeholder", () => {
  /*
    欄位看起來已經填好了，而「刪除」卻是停用的 ——
    使用者只會反覆點那顆按鈕，然後回報「按了沒反應」。
  */
  assert.ok(
    !/placeholder=\{requireText\}/.test(code),
    "placeholder 等於要輸入的值時，欄位看起來像已填好",
  );
  assert.ok(
    !/placeholder=/.test(code.slice(code.indexOf("<Input"), code.indexOf("</div>", code.indexOf("<Input")))),
    "這個欄位不需要 placeholder，label 已經說了要輸入什麼",
  );
});

test("輸入不符時說明原因，而非只把框變紅", () => {
  assert.match(code, /區分大小寫/, "紅框不會告訴使用者差在哪裡");
  assert.match(code, /aria-invalid=\{mismatch\}/);
});

test("長字串與長說明不會把對話框撐破或推出視窗", () => {
  assert.match(code, /break-words/, "契約編號這類長字串不換行會撐破寬度");
  assert.match(
    code,
    /max-h-\[90vh\][\s\S]{0,80}overflow-y-auto/,
    "說明很長時，最底下的取消／刪除會被推到視窗外",
  );
});

test("破壞性對話框必須能以 Esc 取消", () => {
  assert.match(code, /e\.key !== "Escape"/);
  assert.match(code, /window\.addEventListener\("keydown", onKey\)/);
  assert.match(
    code,
    /window\.removeEventListener\("keydown", onKey\)/,
    "沒有解除監聽，關掉後仍會攔 Esc",
  );
});

test("同頁多個確認框各有自己的欄位 id", () => {
  /*
    寫死 id 時，label 一律指到第一個欄位 —— 在清單每列一個刪除鍵的畫面上，
    點某一列的文字會把焦點送到第一列去。
  */
  assert.match(code, /useId\(\)/);
  assert.ok(!/id="confirm-text"/.test(code), "不得寫死 id");
});
