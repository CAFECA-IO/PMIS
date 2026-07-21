import { prisma } from "./client";

const activeProject = { project: { deletedAt: null } };

export function listWithProject() {
  return prisma.ehsAudit.findMany({
    where: activeProject,
    orderBy: { auditedAt: "desc" },
    include: { project: true },
  });
}

export function count() {
  return prisma.ehsAudit.count({ where: activeProject });
}
