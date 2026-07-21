import type { FinancialDirection } from "@/generated/prisma/enums";

/**
 * Info: (20260721 - Luphia)
 * 純財務計算，無 DB 依賴，可單元測試並於前端重用。
 */

export type VoucherLike = {
  direction: FinancialDirection;
  amount: number;
  cashFlow: boolean;
  category: string;
};

export type FinanceSummary = {
  income: number;
  expense: number;
  profit: number; // Info: (20260721 - Luphia) 損益 = 收入 - 支出
  cash: number; // Info: (20260721 - Luphia) 現金水位 = 影響現金之收入 - 支出
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
  count: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function summarizeVouchers(vouchers: VoucherLike[]): FinanceSummary {
  let income = 0;
  let expense = 0;
  let cash = 0;
  const incomeByCategory: Record<string, number> = {};
  const expenseByCategory: Record<string, number> = {};

  for (const v of vouchers) {
    const amt = Number.isFinite(v.amount) ? v.amount : 0;
    if (v.direction === "INCOME") {
      income += amt;
      incomeByCategory[v.category] = (incomeByCategory[v.category] ?? 0) + amt;
      if (v.cashFlow) cash += amt;
    } else {
      expense += amt;
      expenseByCategory[v.category] = (expenseByCategory[v.category] ?? 0) + amt;
      if (v.cashFlow) cash -= amt;
    }
  }

  return {
    income: round(income),
    expense: round(expense),
    profit: round(income - expense),
    cash: round(cash),
    incomeByCategory,
    expenseByCategory,
    count: vouchers.length,
  };
}
