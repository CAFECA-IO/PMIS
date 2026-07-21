import * as financeRepo from "@/repository/finance.repository";
import * as carbonRepo from "@/repository/carbon.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as calc from "@/service/finance.calc";
import { canSeeAllProjects } from "@/lib/auth";
import type {
  AccountRole,
  FinancialDirection,
  VoucherStatus,
} from "@/generated/prisma/enums";

export type Actor = { id: string; name: string; role: AccountRole };

const num = (v: unknown) => (v == null ? 0 : Number(v));

export async function canAccess(projectId: string, actor: Actor) {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

// Info: (20260721 - Luphia) 單一專案財務：傳票清單 + 損益/收支/現金摘要
export async function getProjectFinance(projectId: string, actor: Actor) {
  if (!(await canAccess(projectId, actor))) return null;
  const vouchers = await financeRepo.listByProject(projectId);
  const summary = calc.summarizeVouchers(
    vouchers.map((v) => ({
      direction: v.direction,
      amount: num(v.amount),
      cashFlow: v.cashFlow,
      category: v.category,
    })),
  );
  return { vouchers, summary };
}

// Info: (20260721 - Luphia) 跨專案財務彙總（供「全部專案」檢視）
export async function crossProjectSummary(actor: Actor, projectId?: string) {
  let ids = await carbonRepo.accessibleProjectIds(
    canSeeAllProjects(actor.role),
    actor.id,
  );
  if (projectId) ids = ids.includes(projectId) ? [projectId] : [];
  const vouchers = await financeRepo.listForProjects(ids);

  const summary = calc.summarizeVouchers(
    vouchers.map((v) => ({
      direction: v.direction,
      amount: num(v.amount),
      cashFlow: v.cashFlow,
      category: v.category,
    })),
  );

  const perProject = new Map<
    string,
    { projectId: string; projectName: string; income: number; expense: number }
  >();
  for (const v of vouchers) {
    const cur = perProject.get(v.projectId) ?? {
      projectId: v.projectId,
      projectName: v.project.name,
      income: 0,
      expense: 0,
    };
    if (v.direction === "INCOME") cur.income += num(v.amount);
    else cur.expense += num(v.amount);
    perProject.set(v.projectId, cur);
  }

  return {
    summary,
    projects: [...perProject.values()]
      .map((p) => ({ ...p, profit: p.income - p.expense }))
      .sort((a, b) => b.expense - a.expense),
  };
}

// Info: (20260721 - Luphia) CRUD
const VALID_DIRECTION: FinancialDirection[] = ["INCOME", "EXPENSE"];

export type VoucherInput = {
  projectId: string;
  voucherNo?: string;
  date?: string;
  direction?: string;
  category?: string;
  amount?: string;
  cashFlow?: string; // Info: (20260721 - Luphia) "on"/"true"/"false"
  counterparty?: string;
  summary?: string;
  evidenceUrl?: string;
  aiExtracted?: boolean;
};

export async function createVoucher(input: VoucherInput, actor: Actor) {
  if (!input.projectId) return null;
  if (!(await canAccess(input.projectId, actor))) return null;

  const amount = Number(input.amount);
  const category = input.category?.trim();
  if (!category || !Number.isFinite(amount) || amount <= 0) return null;

  const direction: FinancialDirection = VALID_DIRECTION.includes(
    input.direction as FinancialDirection,
  )
    ? (input.direction as FinancialDirection)
    : "EXPENSE";

  return financeRepo.create({
    projectId: input.projectId,
    voucherNo: input.voucherNo?.trim() || null,
    date: input.date ? new Date(input.date) : new Date(),
    direction,
    category,
    amount,
    cashFlow: input.cashFlow == null ? true : input.cashFlow !== "false",
    counterparty: input.counterparty?.trim() || null,
    summary: input.summary?.trim() || null,
    evidenceUrl: input.evidenceUrl?.trim() || null,
    aiExtracted: input.aiExtracted ?? false,
    status: "DRAFT",
    createdBy: actor.id,
  });
}

export async function setVoucherStatus(
  id: string,
  status: VoucherStatus,
  actor: Actor,
) {
  const v = await financeRepo.findById(id);
  if (!v || !(await canAccess(v.projectId, actor))) return null;
  await financeRepo.updateStatus(id, status);
  return true;
}

export async function removeVoucher(id: string, actor: Actor) {
  const v = await financeRepo.findById(id);
  if (!v || !(await canAccess(v.projectId, actor))) return null;
  await financeRepo.softDelete(id);
  return true;
}
