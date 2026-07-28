import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_ASSIGN_IDS,
  limitUploadIds,
  normalizeUploadIds,
} from "./upload-assign";

test("normalizeUploadIds 去重並保留順序", () => {
  assert.deepEqual(
    normalizeUploadIds(["b", "a", "b", "c", "a"]),
    ["b", "a", "c"],
  );
});

test("normalizeUploadIds 濾除空值與空白", () => {
  assert.deepEqual(
    normalizeUploadIds(["a", "", "   ", null, undefined, "b"]),
    ["a", "b"],
  );
});

test("normalizeUploadIds 去除前後空白後再比對重複", () => {
  assert.deepEqual(normalizeUploadIds([" a ", "a"]), ["a"]);
});

test("normalizeUploadIds 空輸入回空陣列", () => {
  assert.deepEqual(normalizeUploadIds([]), []);
  assert.deepEqual(normalizeUploadIds(null), []);
  assert.deepEqual(normalizeUploadIds(undefined), []);
});

test("limitUploadIds 未超限時原樣回傳", () => {
  const ids = ["a", "b", "c"];
  const r = limitUploadIds(ids);
  assert.deepEqual(r.ids, ids);
  assert.equal(r.truncated, false);
});

test("limitUploadIds 超限時截斷並標示", () => {
  const many = Array.from({ length: MAX_ASSIGN_IDS + 5 }, (_, i) => `id${i}`);
  const r = limitUploadIds(many);
  assert.equal(r.ids.length, MAX_ASSIGN_IDS);
  assert.equal(r.truncated, true);
  assert.equal(r.ids[0], "id0");
});

test("邊界值恰好等於上限不算截斷", () => {
  const exact = Array.from({ length: MAX_ASSIGN_IDS }, (_, i) => `id${i}`);
  assert.equal(limitUploadIds(exact).truncated, false);
});
