import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QTY_COUNTED_REPORT_STATUSES,
  countsTowardQty,
} from "./pmis";

test("草稿日報不計入累計（決策 G）", () => {
  assert.equal(countsTowardQty("DRAFT"), false);
});

test("已提送與已核備計入累計", () => {
  assert.equal(countsTowardQty("SUBMITTED"), true);
  assert.equal(countsTowardQty("APPROVED"), true);
});

test("計入清單恰為兩種狀態，且不含草稿", () => {
  assert.deepEqual([...QTY_COUNTED_REPORT_STATUSES], ["SUBMITTED", "APPROVED"]);
  assert.equal(QTY_COUNTED_REPORT_STATUSES.includes("DRAFT"), false);
});
