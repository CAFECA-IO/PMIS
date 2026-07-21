import { prisma } from "./client";
import type { DefectStatus } from "@/generated/prisma/enums";

const activeProject = { project: { deletedAt: null } };
const OPEN_STATUSES: DefectStatus[] = ["OPEN", "IN_PROGRESS"];

export function listWithProject(projectId?: string) {
  return prisma.defect.findMany({
    where: { ...activeProject, ...(projectId ? { projectId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { project: true },
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
