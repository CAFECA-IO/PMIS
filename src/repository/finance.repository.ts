import { prisma } from "./client";
import type { FinancialDirection, VoucherStatus } from "@/generated/prisma/enums";

export function listByProject(projectId: string) {
  return prisma.financialVoucher.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { date: "desc" },
  });
}

export function listForProjects(projectIds: string[]) {
  return prisma.financialVoucher.findMany({
    where: { projectId: { in: projectIds }, deletedAt: null },
    include: { project: { select: { id: true, name: true } } },
  });
}

export function findById(id: string) {
  return prisma.financialVoucher.findFirst({ where: { id, deletedAt: null } });
}

export type CreateVoucherData = {
  projectId: string;
  voucherNo?: string | null;
  date: Date;
  direction: FinancialDirection;
  category: string;
  amount: number;
  cashFlow: boolean;
  counterparty?: string | null;
  summary?: string | null;
  evidenceUrl?: string | null;
  aiExtracted?: boolean;
  status?: VoucherStatus;
  createdBy?: string | null;
};

export function create(data: CreateVoucherData) {
  return prisma.financialVoucher.create({ data });
}

export function updateStatus(id: string, status: VoucherStatus) {
  return prisma.financialVoucher.update({ where: { id }, data: { status } });
}

export function softDelete(id: string) {
  return prisma.financialVoucher.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
