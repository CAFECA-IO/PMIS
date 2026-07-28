import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SEARCH_RESULTS,
  isSearchable,
  joinPath,
  limitResults,
  matchesQuery,
  normalizeQuery,
  queryTerms,
  searchSummary,
} from "./file-search";

// ── normalizeQuery ──────────────────────────────────────────
test("去除前後空白", () => {
  assert.equal(normalizeQuery("  契約  "), "契約");
});

test("連續空白收斂為單一空格", () => {
  assert.equal(normalizeQuery("契約   附件"), "契約 附件");
});

test("換行與定位字元視為空白", () => {
  assert.equal(normalizeQuery("契約\n\t附件"), "契約 附件");
});

test("空值回空字串", () => {
  assert.equal(normalizeQuery(null), "");
  assert.equal(normalizeQuery(undefined), "");
  assert.equal(normalizeQuery("   "), "");
});

// ── isSearchable ────────────────────────────────────────────
test("空白不構成搜尋，否則會列出全部檔案", () => {
  assert.equal(isSearchable(""), false);
  assert.equal(isSearchable("   "), false);
  assert.equal(isSearchable(null), false);
});

test("單一字元即可搜尋（中文常以單字查詢）", () => {
  assert.equal(isSearchable("圖"), true);
});

// ── matchesQuery ────────────────────────────────────────────
test("子字串比對", () => {
  assert.equal(matchesQuery("01.契約本文(正).docx", "契約"), true);
  assert.equal(matchesQuery("01.契約本文(正).docx", "決標"), false);
});

test("不分大小寫", () => {
  assert.equal(matchesQuery("Contract.PDF", "pdf"), true);
  assert.equal(matchesQuery("contract.pdf", "PDF"), true);
  assert.equal(matchesQuery("平面圖.DWG", "dwg"), true);
});

test("多關鍵詞為 AND，需全部命中", () => {
  assert.equal(matchesQuery("契約本文.pdf", "契約 pdf"), true);
  assert.equal(matchesQuery("契約本文.docx", "契約 pdf"), false);
  assert.equal(matchesQuery("決標公告.pdf", "契約 pdf"), false);
});

test("關鍵詞順序不影響結果", () => {
  assert.equal(matchesQuery("契約本文.pdf", "pdf 契約"), true);
});

test("空查詢一律不命中（避免誤列全部）", () => {
  assert.equal(matchesQuery("任何檔案.pdf", ""), false);
  assert.equal(matchesQuery("任何檔案.pdf", "   "), false);
});

test("名稱為空值時不命中且不拋錯", () => {
  assert.equal(matchesQuery(null, "契約"), false);
  assert.equal(matchesQuery(undefined, "契約"), false);
});

test("queryTerms 拆詞並轉小寫", () => {
  assert.deepEqual(queryTerms(" 契約 PDF "), ["契約", "pdf"]);
  assert.deepEqual(queryTerms(""), []);
});

// ── joinPath ────────────────────────────────────────────────
test("路徑以斜線串接", () => {
  assert.equal(joinPath(["捷運藍線", "契約文件", "附件"]), "捷運藍線 / 契約文件 / 附件");
});

test("根目錄只有專案名稱", () => {
  assert.equal(joinPath(["捷運藍線"]), "捷運藍線");
});

test("略過空白層級，不留下多餘斜線", () => {
  assert.equal(joinPath(["捷運藍線", "", "  ", "附件"]), "捷運藍線 / 附件");
});

// ── limitResults ────────────────────────────────────────────
test("未超過上限時原樣回傳", () => {
  const items = [1, 2, 3];
  const r = limitResults(items, 10);
  assert.deepEqual(r.items, items);
  assert.equal(r.truncated, false);
});

test("超過上限時截斷並標示", () => {
  const items = Array.from({ length: 12 }, (_, i) => i);
  const r = limitResults(items, 5);
  assert.equal(r.items.length, 5);
  assert.equal(r.truncated, true);
  assert.deepEqual(r.items, [0, 1, 2, 3, 4]);
});

test("預設上限為 MAX_SEARCH_RESULTS", () => {
  const items = Array.from({ length: MAX_SEARCH_RESULTS + 1 }, (_, i) => i);
  assert.equal(limitResults(items).items.length, MAX_SEARCH_RESULTS);
  assert.equal(limitResults(items).truncated, true);
});

// ── searchSummary ───────────────────────────────────────────
test("沒有結果時明確說找不到", () => {
  const s = searchSummary({
    query: "決標",
    count: 0,
    truncated: false,
    scanTruncated: false,
  });
  assert.match(s, /找不到/);
  assert.match(s, /決標/);
});

test("正常結果報出筆數", () => {
  const s = searchSummary({
    query: "契約",
    count: 7,
    truncated: false,
    scanTruncated: false,
  });
  assert.match(s, /共 7 筆/);
});

test("結果被截斷時說明是「前 N 筆」而非全部", () => {
  const s = searchSummary({
    query: "契約",
    count: 200,
    truncated: true,
    scanTruncated: false,
  });
  assert.match(s, /前 200 筆/);
  assert.doesNotMatch(s, /共 200 筆/);
});

test("掃描觸及上限時必須告知結果可能不完整", () => {
  const s = searchSummary({
    query: "契約",
    count: 12,
    truncated: false,
    scanTruncated: true,
  });
  assert.match(s, /可能不完整/);
});
