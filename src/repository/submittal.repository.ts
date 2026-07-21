import { prisma } from "./client";
import type { SubmittalStatus } from "@/generated/prisma/enums";

const activeProject = { project: { deletedAt: null } };

const PENDING_STATUSES: SubmittalStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "RETURNED",
];

export function listWithProject(projectId?: string) {
  return prisma.submittal.findMany({
    where: { ...activeProject, ...(projectId ? { projectId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { project: true },
  });
}

export function count() {
  return prisma.submittal.count({ where: activeProject });
}

export function countPending() {
  return prisma.submittal.count({
    where: { status: { in: PENDING_STATUSES }, ...activeProject },
  });
}

export function countByStatus(status: SubmittalStatus, since?: Date) {
  return prisma.submittal.count({
    where: {
      status,
      ...activeProject,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
  });
}
