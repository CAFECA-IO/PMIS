import { prisma } from "./client";
import type { InspectionResult } from "@/generated/prisma/enums";

/**
 * Project-scoped aggregations for the "screen focus" hints. Every module entity
 * carries a required projectId, so counts are filtered to the viewer's set of
 * accessible projects (ADMIN/MANAGER get all active projects).
 */

export async function accessibleProjectIds(
  seeAll: boolean,
  accountId: string,
): Promise<string[]> {
  const where = seeAll
    ? { deletedAt: null }
    : { deletedAt: null, members: { some: { accountId } } };
  const rows = await prisma.project.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}

const scope = (ids: string[]) => ({ projectId: { in: ids } });

export function countOpenDefects(ids: string[]) {
  return prisma.defect.count({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] }, ...scope(ids) },
  });
}

export function countTodos(ids: string[]) {
  return prisma.todoItem.count({ where: scope(ids) });
}
export function countOverdueTodos(ids: string[]) {
  return prisma.todoItem.count({ where: { status: "OVERDUE", ...scope(ids) } });
}

export function countSubmittals(ids: string[]) {
  return prisma.submittal.count({ where: scope(ids) });
}
export function countPendingSubmittals(ids: string[]) {
  return prisma.submittal.count({
    where: {
      status: { in: ["SUBMITTED", "UNDER_REVIEW", "RETURNED"] },
      ...scope(ids),
    },
  });
}

export function countUpcomingReminders(ids: string[]) {
  return prisma.reminderEvent.count({
    where: { status: { not: "DONE" }, ...scope(ids) },
  });
}

export function countEhs(ids: string[]) {
  return prisma.ehsAudit.count({ where: scope(ids) });
}

export function countMedia(ids: string[]) {
  return prisma.mediaAsset.count({ where: scope(ids) });
}

export function countInspectionsByResult(result: InspectionResult, ids: string[]) {
  return prisma.inspection.count({ where: { result, ...scope(ids) } });
}

export function listMilestonesForMetrics(ids: string[]) {
  return prisma.milestone.findMany({
    where: { deletedAt: null, type: "MILESTONE", projectId: { in: ids } },
    select: {
      weight: true,
      plannedDate: true,
      actualDate: true,
      commissioning: true,
    },
  });
}
