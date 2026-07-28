import { prisma } from "./client";
import type {
  ObligationRisk,
  ObligationStage,
  ObligationStatus,
  ObligationTrigger,
} from "@/generated/prisma/enums";

/** 履約事項的資料存取。 */

export type CreateObligationData = {
  projectId: string;
  code: string;
  title: string;
  stage: ObligationStage;
  risk?: ObligationRisk;
  triggerType?: ObligationTrigger;
  status?: ObligationStatus;
  dueDate?: Date;
  actualDate?: Date;
  ownerUnit?: string;
  ownerName?: string;
  contractBasis?: string;
  weight?: number;
  commissioning?: boolean;
  offsetDays?: number;
  docNo?: string;
  note?: string;
};

export function create(data: CreateObligationData) {
  return prisma.contractObligation.create({ data });
}

export function findById(id: string) {
  return prisma.contractObligation.findUnique({
    where: { id },
    select: { id: true, projectId: true, stage: true, status: true },
  });
}

/** 畫面用的完整清單（含專案名稱，供跨專案檢視）。以可存取專案 id 收斂範圍。 */
export function listForView(projectIds: string[]) {
  return prisma.contractObligation.findMany({
    where: {
      deletedAt: null,
      projectId: { in: projectIds },
      project: { deletedAt: null },
    },
    select: {
      id: true,
      projectId: true,
      code: true,
      title: true,
      stage: true,
      risk: true,
      triggerType: true,
      status: true,
      dueDate: true,
      actualDate: true,
      ownerUnit: true,
      ownerName: true,
      contractBasis: true,
      project: { select: { name: true } },
    },
    orderBy: { code: "asc" },
  });
}

/** 進度指標用（排除已刪除與已刪除專案）。 */
export function listForMetrics() {
  return prisma.contractObligation.findMany({
    where: {
      deletedAt: null,
      project: { deletedAt: null },
    },
    select: {
      id: true,
      weight: true,
      dueDate: true,
      actualDate: true,
      commissioning: true,
    },
  });
}

/** 標記完成：寫入實際完成日並轉為 DONE。 */
export function markDone(id: string, actualDate: Date = new Date()) {
  return prisma.contractObligation.update({
    where: { id },
    data: { actualDate, status: "DONE" },
  });
}

export function update(id: string, data: Partial<CreateObligationData>) {
  return prisma.contractObligation.update({ where: { id }, data });
}

export function softDelete(id: string) {
  return prisma.contractObligation.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.contractObligation.update({
    where: { id },
    data: { deletedAt: null },
  });
}
