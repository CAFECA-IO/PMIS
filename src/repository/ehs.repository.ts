import { prisma } from "./client";

const activeProject = { project: { deletedAt: null } };

export function listWithProject(projectId?: string) {
  return prisma.ehsAudit.findMany({
    where: { ...activeProject, ...(projectId ? { projectId } : {}) },
    orderBy: { auditedAt: "desc" },
    include: { project: true },
  });
}

export function count() {
  return prisma.ehsAudit.count({ where: activeProject });
}
