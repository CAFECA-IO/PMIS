import { prisma } from "./client";
import type { InspectionResult, InspectionType } from "@/generated/prisma/enums";

const activeProject = { project: { deletedAt: null } };

export type CreateInspectionData = {
  projectId: string;
  workItemId?: string | null;
  type: InspectionType;
  scheduledAt: Date;
  inspector?: string | null;
  result: InspectionResult;
  location?: string | null;
  notes?: string | null;
};

export function create(data: CreateInspectionData) {
  return prisma.inspection.create({ data });
}

export function listWithRelations(projectId?: string) {
  return prisma.inspection.findMany({
    where: { ...activeProject, ...(projectId ? { projectId } : {}) },
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
