import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_LISTED_FAILURES,
  deleteConfirmCopy,
  uploadProgressCopy,
  uploadResultCopy,
  uploadStartCopy,
} from "./file-messages";

// ── 刪除確認 ────────────────────────────────────────────────
test("檔案的確認文案含檔名", () => {
  const c = deleteConfirmCopy({ kind: "file", name: "契約本文.docx" });
  assert.match(c.title, /契約本文\.docx/);
  assert.match(c.title, /刪除檔案/);
});

test("資料夾必須說出連帶刪除的數量", () => {
  const c = deleteConfirmCopy(
    { kind: "folder", name: "契約文件" },
    { folders: 3, files: 27, bytes: 0 },
  );
  assert.match(c.description, /3 個子資料夾/);
  assert.match(c.description, /27 個檔案/);
  assert.equal(c.confirmLabel, "一併刪除");
});

test("兩項並列時「與」後方留空格，阿拉伯數字不緊貼中文", () => {
  const c = deleteConfirmCopy(
    { kind: "folder", name: "契約文件" },
    { folders: 1, files: 4, bytes: 0 },
  );
  assert.match(c.description, /1 個子資料夾與 4 個檔案/);
});

test("只有檔案沒有子資料夾時不提子資料夾", () => {
  const c = deleteConfirmCopy(
    { kind: "folder", name: "圖說" },
    { folders: 0, files: 5, bytes: 0 },
  );
  assert.match(c.description, /5 個檔案/);
  assert.doesNotMatch(c.description, /子資料夾/);
});

test("只有子資料夾沒有檔案時不提檔案數", () => {
  const c = deleteConfirmCopy(
    { kind: "folder", name: "分區" },
    { folders: 2, files: 0, bytes: 0 },
  );
  assert.match(c.description, /2 個子資料夾/);
  assert.doesNotMatch(c.description, /個檔案/);
});

test("空資料夾明說沒有內容，且確認鈕不寫「一併刪除」", () => {
  const c = deleteConfirmCopy(
    { kind: "folder", name: "新資料夾" },
    { folders: 0, files: 0, bytes: 0 },
  );
  assert.match(c.description, /沒有內容/);
  assert.equal(c.confirmLabel, "刪除資料夾");
});

test("內容量未知時不編造數字", () => {
  const c = deleteConfirmCopy({ kind: "folder", name: "資料夾" }, null);
  assert.doesNotMatch(c.description, /\d+ 個/);
});

test("刪除說明點出檔案仍可復原（軟刪除的事實）", () => {
  const file = deleteConfirmCopy({ kind: "file", name: "a.pdf" });
  const folder = deleteConfirmCopy({ kind: "folder", name: "b" }, null);
  assert.match(file.description, /復原/);
  assert.match(folder.description, /復原/);
});

// ── 上傳通知 ────────────────────────────────────────────────
test("開始上傳的通知含總數與目的地", () => {
  const c = uploadStartCopy(12, "契約文件");
  assert.match(c.title, /12 個檔案/);
  assert.match(c.description, /契約文件/);
});

test("進度說明與百分比一致", () => {
  const c = uploadProgressCopy(5, 20);
  assert.match(c.description, /5 \/ 20/);
  assert.equal(c.percent, 25);
});

test("進度為零與完成的兩端", () => {
  assert.equal(uploadProgressCopy(0, 10).percent, 0);
  assert.equal(uploadProgressCopy(10, 10).percent, 100);
});

test("已完成數不會超過總數，避免顯示 12/10", () => {
  const c = uploadProgressCopy(12, 10);
  assert.match(c.description, /10 \/ 10/);
  assert.equal(c.percent, 100);
});

test("負數與零總數不得產生 NaN 或除以零", () => {
  const zero = uploadProgressCopy(0, 0);
  assert.equal(zero.percent, 0);
  assert.match(zero.description, /準備中/);
  assert.equal(uploadProgressCopy(-3, 10).percent, 0);
});

test("全部成功為 success", () => {
  const r = uploadResultCopy({ saved: 8, failed: 0, folderName: "圖說" });
  assert.equal(r.variant, "success");
  assert.match(r.title, /已上傳 8 個檔案/);
});

test("部分失敗不得說成成功", () => {
  const r = uploadResultCopy({
    saved: 6,
    failed: 2,
    folderName: "圖說",
    failures: [
      { name: "big.zip", reason: "檔案過大" },
      { name: "x.exe", reason: "不支援的格式" },
    ],
  });
  assert.equal(r.variant, "error");
  assert.match(r.title, /6 個檔案/);
  assert.match(r.title, /2 個失敗/);
  assert.match(r.description, /big\.zip：檔案過大/);
  assert.match(r.description, /x\.exe：不支援的格式/);
});

test("全部失敗時標題不提任何成功數", () => {
  const r = uploadResultCopy({
    saved: 0,
    failed: 3,
    folderName: "圖說",
    failures: [{ name: "a", reason: "壞了" }],
  });
  assert.equal(r.variant, "error");
  assert.match(r.title, /上傳失敗/);
  assert.doesNotMatch(r.title, /已上傳/);
});

test("失敗清單過長時截斷並說明還有幾個", () => {
  const failures = Array.from({ length: MAX_LISTED_FAILURES + 4 }, (_, i) => ({
    name: `f${i}.pdf`,
    reason: "壞了",
  }));
  const r = uploadResultCopy({
    saved: 0,
    failed: failures.length,
    folderName: "圖說",
    failures,
  });
  const lines = r.description.split("\n");
  // 第一行是目的地，其後為失敗清單與「另有」摘要
  assert.equal(lines.length, 1 + MAX_LISTED_FAILURES + 1);
  assert.match(lines[lines.length - 1], /另有 4 個檔案失敗/);
});

test("零成功零失敗為中性訊息，不謊稱成功", () => {
  const r = uploadResultCopy({ saved: 0, failed: 0, folderName: "圖說" });
  assert.equal(r.variant, "info");
  assert.match(r.title, /沒有檔案/);
});

test("結果通知一律帶目的地，使用者才知道檔案去哪了", () => {
  for (const outcome of [
    { saved: 3, failed: 0, folderName: "契約文件" },
    { saved: 0, failed: 1, folderName: "契約文件" },
    { saved: 0, failed: 0, folderName: "契約文件" },
  ]) {
    assert.match(uploadResultCopy(outcome).description, /目的地：契約文件/);
  }
});
