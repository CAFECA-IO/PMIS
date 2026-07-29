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
