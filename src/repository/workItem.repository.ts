import { prisma } from "./client";
import type { WorkItemStatus } from "@/generated/prisma/enums";

export function count() {
  return prisma.workItem.count({ where: { project: { deletedAt: null } } });
}

export type CreateWorkItemData = {
  /** 所屬工程項目（規劃階段的分群）。 */
  workPackage?: string | null;
  /** 推導來源的契約履約標的。 */
  scopeItemId?: string | null;
  projectId: string;
  code?: string | null;
  name: string;
  category?: string | null;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  actualStart?: Date | null;
  actualEnd?: Date | null;
  progress?: number;
  status?: WorkItemStatus;
  obligationId?: string | null;
  /** 台帳上的 WBS 代碼，如 WBS-2.1。 */
  wbsCode?: string | null;
  /** WBS 類別 id。 */
  wbsCategory?: string | null;
  /** 計量單位。 */
  unit?: string | null;
  contractQty?: number | null;
  unitPrice?: number | null;
  completedQty?: number | null;
  inspectedQty?: number | null;
  valuatedQty?: number | null;
};

/** Partial update — only provided keys are written; null clears the field. */
export type UpdateWorkItemData = {
  code?: string | null;
  name?: string;
  category?: string | null;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  actualStart?: Date | null;
  actualEnd?: Date | null;
  progress?: number;
  status?: WorkItemStatus;
  obligationId?: string | null;
  /** 台帳上的 WBS 代碼，如 WBS-2.1。 */
  wbsCode?: string | null;
  /** WBS 類別 id。 */
  wbsCategory?: string | null;
  /** 計量單位。 */
  unit?: string | null;
  contractQty?: number | null;
  unitPrice?: number | null;
  completedQty?: number | null;
  inspectedQty?: number | null;
  valuatedQty?: number | null;
};

export function findById(id: string) {
  return prisma.workItem.findUnique({ where: { id } });
}

/** 供下拉選單：專案的工項清單（id / name / status）。 */
export function listByProject(projectId: string) {
  return prisma.workItem.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, status: true },
  });
}

/** 工程分項明細（含所屬履約事項），供畫面與上捲計算共用。 */
const detailSelect = {
  id: true,
  name: true,
  status: true,
  progress: true,
  plannedStart: true,
  plannedEnd: true,
  actualStart: true,
  actualEnd: true,
  obligationId: true,
} as const;

/** 台帳所需欄位：分項識別＋六個數量欄位。 */
const ledgerSelect = {
  id: true,
  code: true,
  name: true,
  category: true,
  workPackage: true,
  obligationId: true,
  status: true,
  progress: true,
  wbsCode: true,
  wbsCategory: true,
  unit: true,
  contractQty: true,
  unitPrice: true,
  completedQty: true,
  inspectedQty: true,
  valuatedQty: true,
} as const;

/** 估驗台帳：專案全部工項的數量與金額。 */
export function listLedgerByProject(projectId: string) {
  return prisma.workItem.findMany({
    where: { projectId },
    orderBy: [{ wbsCode: "asc" }, { code: "asc" }, { createdAt: "asc" }],
    select: ledgerSelect,
  });
}

export type LedgerWorkItemRow = Awaited<
  ReturnType<typeof listLedgerByProject>
>[number];

const metricSelect = {
  projectId: true,
  progress: true,
  plannedStart: true,
  plannedEnd: true,
  actualStart: true,
  actualEnd: true,
  obligationId: true,
} as const;

export function listDetailByProject(projectId: string) {
  return prisma.workItem.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: detailSelect,
  });
}

/**
 * 某履約事項底下的工程分項。
 *
 * 先前全站都是「載入整個專案的工程分項再於記憶體過濾 obligationId」，
 * 履約事項細節頁只需要自己底下的幾項，沒有理由把整案撈出來。
 */
export function listByObligation(obligationId: string) {
  return prisma.workItem.findMany({
    where: { obligationId },
    orderBy: [{ code: "asc" }, { createdAt: "asc" }],
    select: {
      ...detailSelect,
      code: true,
      category: true,
      workPackage: true,
      projectId: true,
    },
  });
}

/**
 * 多個履約事項底下的工程分項狀態（供清單判斷可否完成）。
 * 只取判斷完成條件所需的欄位。
 */
export function listStatesByObligations(obligationIds: string[]) {
  if (obligationIds.length === 0) {
    return Promise.resolve(
      [] as { id: string; name: string; status: string; progress: number; obligationId: string | null }[],
    );
  }
  return prisma.workItem.findMany({
    where: { obligationId: { in: obligationIds } },
    select: {
      id: true,
      name: true,
      status: true,
      progress: true,
      obligationId: true,
    },
  });
}

/** 多個履約事項底下分項的預定起訖（供甘特圖聚合工作區間）。 */
export function listPlanByObligations(obligationIds: string[]) {
  if (obligationIds.length === 0) {
    return Promise.resolve(
      [] as {
        obligationId: string | null;
        plannedStart: Date | null;
        plannedEnd: Date | null;
      }[],
    );
  }
  return prisma.workItem.findMany({
    where: { obligationId: { in: obligationIds } },
    select: { obligationId: true, plannedStart: true, plannedEnd: true },
  });
}

/** 批次讀取多專案工程分項明細（供專案列表逐案上捲進度）。 */
export function listDetailByProjectIds(projectIds: string[]) {
  if (projectIds.length === 0) {
    return Promise.resolve([] as Awaited<ReturnType<typeof listAllDetailForMetrics>>);
  }
  return prisma.workItem.findMany({
    where: { projectId: { in: projectIds } },
    select: metricSelect,
  });
}

/** 全體（未刪除專案）工程分項明細，供儀表板 S-Curve 上捲。 */
export function listAllDetailForMetrics() {
  return prisma.workItem.findMany({
    where: { project: { deletedAt: null } },
    select: metricSelect,
  });
}

export type WorkItemDetailRow = Awaited<
  ReturnType<typeof listDetailByProject>
>[number];
export type WorkItemMetricRow = Awaited<
  ReturnType<typeof listAllDetailForMetrics>
>[number];

/** 掛載／解除工程分項所屬的履約事項。 */
export async function setObligation(id: string, obligationId: string | null) {
  await prisma.workItem.update({ where: { id }, data: { obligationId } });
}

export function create(data: CreateWorkItemData) {
  return prisma.workItem.create({ data });
}

export function update(id: string, data: UpdateWorkItemData) {
  return prisma.workItem.update({ where: { id }, data });
}

export function remove(id: string) {
  return prisma.workItem.delete({ where: { id } });
}
