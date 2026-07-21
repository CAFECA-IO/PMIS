import { prisma } from "./client";

/** Period-scoped reads for AI 報告生成（工程日誌）。 */

export function getProject(id: string) {
  return prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      milestones: { where: { deletedAt: null }, orderBy: { plannedDate: "asc" } },
      workItems: { orderBy: { createdAt: "asc" } },
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
