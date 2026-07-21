import { prisma } from "./client";
import type { InspectionResult } from "@/generated/prisma/enums";

const activeProject = { project: { deletedAt: null } };

export function listWithRelations() {
  return prisma.inspection.findMany({
    where: activeProject,
    orderBy: { scheduledAt: "desc" },
    include: { project: true, workItem: true },
  });
}

export function count() {
  return prisma.inspection.count({ where: activeProject });
}

export function countByResult(result: InspectionResult, since?: Date) {
  return prisma.inspection.count({
    where: {
      result,
      ...activeProject,
      ...(since ? { scheduledAt: { gte: since } } : {}),
    },
  });
}
