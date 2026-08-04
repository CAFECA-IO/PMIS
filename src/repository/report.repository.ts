import { prisma } from "./client";

// Info: (20260721 - Luphia) 期間範圍查詢，供 AI 報告生成（工程日誌）

export function getProject(id: string) {
  return prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      obligations: { where: { deletedAt: null }, orderBy: { dueDate: "asc" } },
      workItems: { orderBy: { createdAt: "asc" } },
      // Info: (20260804 - Julian) 契約標的即監造月報的「工程概要」；
      // title 已含品項與數量（如「人孔 20 座」），依契約原始順序輸出
      scopeItems: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        select: { code: true, title: true, sortOrder: true },
      },
    },
  });
}

export function defectsInPeriod(projectId: string, start: Date, end: Date) {
  return prisma.defect.findMany({
    where: { projectId, createdAt: { gte: start, lte: end } },
    select: { severity: true, status: true, title: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export function openDefects(projectId: string) {
  return prisma.defect.findMany({
    where: { projectId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: { severity: true, status: true, title: true, dueDate: true },
    orderBy: { dueDate: "asc" },
  });
}

export function inspectionsInPeriod(projectId: string, start: Date, end: Date) {
  return prisma.inspection.findMany({
    where: { projectId, scheduledAt: { gte: start, lte: end } },
    select: { result: true, type: true },
  });
}

export function submittalsInPeriod(projectId: string, start: Date, end: Date) {
  return prisma.submittal.findMany({
    where: { projectId, createdAt: { gte: start, lte: end } },
    select: { status: true },
  });
}

export function ehsInPeriod(projectId: string, start: Date, end: Date) {
  return prisma.ehsAudit.findMany({
    where: { projectId, auditedAt: { gte: start, lte: end } },
    select: { result: true },
  });
}

// Info: (20260803 - Julian) 本期已結案缺失（供改善耗時直方圖）：resolvedAt 落在期間內
export function defectsResolvedInPeriod(
  projectId: string,
  start: Date,
  end: Date,
) {
  return prisma.defect.findMany({
    where: { projectId, resolvedAt: { gte: start, lte: end } },
    select: { createdAt: true, resolvedAt: true },
  });
}

// Info: (20260803 - Julian) 本期完成審查的送審（供審查天數箱型圖）：需有實際送審日與審查日
export function submittalsReviewedInPeriod(
  projectId: string,
  start: Date,
  end: Date,
) {
  return prisma.submittal.findMany({
    where: {
      projectId,
      reviewDate: { gte: start, lte: end },
      actualSubmitDate: { not: null },
    },
    select: { category: true, actualSubmitDate: true, reviewDate: true },
  });
}

export function carbonInventories(projectId: string) {
  return prisma.carbonInventory.findMany({
    where: { projectId, deletedAt: null },
    include: {
      entries: {
        where: { deletedAt: null },
        select: { scope: true, co2e: true, status: true },
      },
    },
  });
}
