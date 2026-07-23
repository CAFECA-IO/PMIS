import { prisma } from "./client";
import type { WorkItemStatus } from "@/generated/prisma/enums";

export function count() {
  return prisma.workItem.count({ where: { project: { deletedAt: null } } });
}

export type CreateWorkItemData = {
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

// Info: milestoneId 於此沙箱無法重新產生 Prisma Client，故以 raw SQL 讀寫該欄位。
export type WorkItemDetailRow = {
  id: string;
  name: string;
  status: string;
  progress: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  milestoneId: string | null;
};

export function listDetailByProject(projectId: string) {
  return prisma.$queryRawUnsafe<WorkItemDetailRow[]>(
    `SELECT "id","name","status","progress","plannedStart","plannedEnd","actualStart","actualEnd","milestoneId"
     FROM "WorkItem" WHERE "projectId" = ? ORDER BY "createdAt" ASC`,
    projectId,
  );
}

export type WorkItemMetricRow = {
  projectId: string;
  progress: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  milestoneId: string | null;
};

/** 批次讀取多專案工項明細（供專案列表逐案上捲進度）。 */
export async function listDetailByProjectIds(projectIds: string[]) {
  if (projectIds.length === 0) return [] as WorkItemMetricRow[];
  const placeholders = projectIds.map(() => "?").join(",");
  return prisma.$queryRawUnsafe<WorkItemMetricRow[]>(
    `SELECT "projectId","progress","plannedStart","plannedEnd","actualStart","actualEnd","milestoneId"
     FROM "WorkItem" WHERE "projectId" IN (${placeholders})`,
    ...projectIds,
  );
}

/** 全體（未刪除專案）工項明細，供儀表板 S-Curve 上捲。 */
export function listAllDetailForMetrics() {
  return prisma.$queryRawUnsafe<WorkItemMetricRow[]>(
    `SELECT w."projectId", w."progress", w."plannedStart", w."plannedEnd",
            w."actualStart", w."actualEnd", w."milestoneId"
     FROM "WorkItem" w JOIN "Project" p ON w."projectId" = p."id"
     WHERE p."deletedAt" IS NULL`,
  );
}

export async function setMilestone(id: string, milestoneId: string | null) {
  await prisma.$executeRawUnsafe(
    `UPDATE "WorkItem" SET "milestoneId" = ?, "updatedAt" = datetime('now') WHERE "id" = ?`,
    milestoneId,
    id,
  );
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
