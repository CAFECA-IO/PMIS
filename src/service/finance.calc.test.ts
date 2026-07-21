import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeVouchers, type VoucherLike } from "./finance.calc";

const sample: VoucherLike[] = [
  { direction: "INCOME", amount: 320, cashFlow: true, category: "工程估驗款" },
  { direction: "INCOME", amount: 285, cashFlow: false, category: "工程估驗款" },
  { direction: "EXPENSE", amount: 96, cashFlow: true, category: "材料" },
  { direction: "EXPENSE", amount: 42, cashFlow: true, category: "人工" },
];

test("summarizeVouchers 損益與收支", () => {
  const s = summarizeVouchers(sample);
  assert.equal(s.income, 605);
  assert.equal(s.expense, 138);
  assert.equal(s.profit, 467);
  assert.equal(s.count, 4);
});

test("summarizeVouchers 現金水位僅計 cashFlow", () => {
  // 現金 = 320（收現）- 96 - 42，未收現的 285 不計入
  const s = summarizeVouchers(sample);
  assert.equal(s.cash, 182);
});

test("summarizeVouchers 分類彙總", () => {
  const s = summarizeVouchers(sample);
  assert.equal(s.incomeByCategory["工程估驗款"], 605);
  assert.equal(s.expenseByCategory["材料"], 96);
  assert.equal(s.expenseByCategory["人工"], 42);
});

test("summarizeVouchers 空清單", () => {
  const s = summarizeVouchers([]);
  assert.deepEqual(
    [s.income, s.expense, s.profit, s.cash, s.count],
    [0, 0, 0, 0, 0],
  );
});
