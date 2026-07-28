import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_UPLOAD_BYTES,
  checkSize,
  dispositionFor,
  extOfName,
  isKnownMime,
  resolveExt,
  responseContentType,
  safeFileName,
  truncatePrompt,
} from "./upload-policy";

// ── extOfName ───────────────────────────────────────────────
test("extOfName 取小寫副檔名並忽略路徑", () => {
  assert.equal(extOfName("a/b/契約書.PDF"), "pdf");
  assert.equal(extOfName("C:\\temp\\表.xlsx"), "xlsx");
});

test("extOfName 對無副檔名、隱藏檔與異常值回 null", () => {
  assert.equal(extOfName("README"), null);
  assert.equal(extOfName(".gitignore"), null); // 點在開頭不算副檔名
  assert.equal(extOfName("trailing."), null);
  assert.equal(extOfName(undefined), null);
  assert.equal(extOfName("weird.名稱"), null); // 非 a-z0-9
  assert.equal(extOfName("long.abcdefghij"), null); // 超過 8 字元
});

// ── resolveExt ──────────────────────────────────────────────
test("resolveExt 以 MIME 為優先", () => {
  assert.equal(resolveExt("application/pdf", "x.txt"), "pdf");
  assert.equal(
    resolveExt(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "無副檔名",
    ),
    "xlsx",
  );
});

test("resolveExt 在 MIME 缺失時退回檔名副檔名", () => {
  assert.equal(resolveExt("", "報告.docx"), "docx");
  assert.equal(resolveExt("application/octet-stream", "資料.csv"), "csv");
});

test("resolveExt 不接受白名單外的檔名副檔名（避免 exe/sh/html 混入）", () => {
  assert.equal(resolveExt("", "惡意.exe"), "bin");
  assert.equal(resolveExt("", "script.sh"), "bin");
  assert.equal(resolveExt("", "page.html"), "bin");
  assert.equal(resolveExt("", "vector.svg"), "bin");
});

test("resolveExt 完全無資訊時給 bin", () => {
  assert.equal(resolveExt("", ""), "bin");
  assert.equal(resolveExt("application/x-unknown", null), "bin");
});

test("isKnownMime 只認白名單", () => {
  assert.equal(isKnownMime("application/pdf"), true);
  assert.equal(isKnownMime("image/svg+xml"), false);
});

// ── safeFileName ────────────────────────────────────────────
test("safeFileName 去除路徑，保留中文", () => {
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName("a\\b\\契約書.pdf"), "契約書.pdf");
});

test("safeFileName 移除控制字元、引號與反斜線（防標頭注入）", () => {
  const dirty = 'bad\u000d\u000aX-Injected: 1\u0000"name".pdf';
  const clean = safeFileName(dirty);
  assert.ok(!clean.includes("\u000d"));
  assert.ok(!clean.includes("\u000a"));
  assert.ok(!clean.includes("\u0000"));
  assert.ok(!clean.includes('"'));
  assert.ok(!clean.includes("\\"));
});

test("safeFileName 空值時以副檔名組出預設名", () => {
  assert.equal(safeFileName("", "pdf"), "attachment.pdf");
  assert.equal(safeFileName(null, "xlsx"), "attachment.xlsx");
  assert.equal(safeFileName("   "), "attachment.bin");
});

test("safeFileName 限制長度", () => {
  assert.equal(safeFileName(`${"我".repeat(300)}.pdf`).length, 120);
});

// ── dispositionFor / responseContentType ────────────────────
test("PDF 與圖片可內嵌檢視", () => {
  assert.equal(dispositionFor("application/pdf", false), "inline");
  assert.equal(dispositionFor("image/png", false), "inline");
  assert.equal(dispositionFor("image/jpeg", false), "inline");
});

test("SVG 與 HTML 一律強制下載（內嵌會執行腳本）", () => {
  assert.equal(dispositionFor("image/svg+xml", false), "attachment");
  assert.equal(dispositionFor("text/html", false), "attachment");
});

test("Office 檔案走下載", () => {
  assert.equal(
    dispositionFor(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      false,
    ),
    "attachment",
  );
});

test("明確要求下載時，連可內嵌的型別也走 attachment", () => {
  assert.equal(dispositionFor("application/pdf", true), "attachment");
  assert.equal(dispositionFor("image/png", true), "attachment");
});

test("非內嵌情形一律以 octet-stream 送出，避免瀏覽器嗅探後渲染", () => {
  assert.equal(
    responseContentType("image/svg+xml", "attachment"),
    "application/octet-stream",
  );
  assert.equal(
    responseContentType("text/html", "attachment"),
    "application/octet-stream",
  );
  // 使用者按下載時，PDF 也不以 application/pdf 送出
  assert.equal(
    responseContentType("application/pdf", "attachment"),
    "application/octet-stream",
  );
  assert.equal(
    responseContentType("application/pdf", "inline"),
    "application/pdf",
  );
});

// ── checkSize ───────────────────────────────────────────────
test("checkSize 擋空檔與超限，允許邊界值", () => {
  assert.ok(checkSize(0));
  assert.ok(checkSize(-1));
  assert.equal(checkSize(1), null);
  assert.equal(checkSize(MAX_UPLOAD_BYTES), null);
  assert.ok(checkSize(MAX_UPLOAD_BYTES + 1));
  assert.match(String(checkSize(MAX_UPLOAD_BYTES + 1)), /25MB/);
});

// ── truncatePrompt ──────────────────────────────────────────
test("truncatePrompt 截斷過長訊息並收斂空值", () => {
  assert.equal(truncatePrompt("  請判讀這份契約  "), "請判讀這份契約");
  assert.equal(truncatePrompt(""), null);
  assert.equal(truncatePrompt("   "), null);
  assert.equal(truncatePrompt(undefined), null);
  const long = truncatePrompt("字".repeat(900));
  assert.equal(long?.length, 501); // 500 + 省略號
  assert.ok(long?.endsWith("…"));
});
