import { prisma } from "./client";
import type { InspectionResult } from "@/generated/prisma/enums";

/**
 * Info: (20260721 - Luphia)
 * 「畫面重點」提示用的專案範圍彙總。各模組實體皆帶必填 projectId，因此計數依
 * 可視專案範圍過濾（ADMIN/MANAGER 取全部啟用專案）。
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
  return prisma.notification.count({ where: scope(ids) });
}
export function countOverdueTodos(ids: string[]) {
  return prisma.notification.count({ where: { status: "OVERDUE", ...scope(ids) } });
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

export function listObligationsForMetrics(ids: string[]) {
  return prisma.contractObligation.findMany({
    where: { deletedAt: null, projectId: { in: ids } },
    select: {
      weight: true,
      dueDate: true,
      actualDate: true,
      commissioning: true,
    },
  });
}
