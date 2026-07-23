import { prisma } from "./client";
import type { DefectStatus, DefectSeverity } from "@/generated/prisma/enums";

const activeProject = { project: { deletedAt: null } };

export type CreateDefectData = {
  projectId: string;
  workItemId?: string | null;
  inspectionId?: string | null;
  title: string;
  description?: string | null;
  severity: DefectSeverity;
  status: DefectStatus;
  reportedBy?: string | null;
  assignedTo?: string | null;
  dueDate?: Date | null;
};

export function create(data: CreateDefectData) {
  return prisma.defect.create({ data });
}
const OPEN_STATUSES: DefectStatus[] = ["OPEN", "IN_PROGRESS"];

export function listWithProject(projectId?: string) {
  return prisma.defect.findMany({
    where: { ...activeProject, ...(projectId ? { projectId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { project: true, workItem: true },
  });
}

export function listOpenLatest(take: number) {
  return prisma.defect.findMany({
    take,
    where: { status: { in: OPEN_STATUSES }, ...activeProject },
    orderBy: { createdAt: "desc" },
    include: { project: true },
  });
}

export function count() {
  return prisma.defect.count({ where: activeProject });
}

export function countOpen() {
  return prisma.defect.count({
    where: { status: { in: OPEN_STATUSES }, ...activeProject },
  });
}

export function countByStatus(status: DefectStatus, since?: Date) {
  return prisma.defect.count({
    where: {
      status,
      ...activeProject,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
  });
}
