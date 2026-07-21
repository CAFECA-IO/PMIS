import { prisma } from "./client";

const activeProject = { project: { deletedAt: null } };

export function listAssets() {
  return prisma.mediaAsset.findMany({
    where: activeProject,
    orderBy: { createdAt: "desc" },
    include: { project: true },
  });
}

export function countAssets() {
  return prisma.mediaAsset.count({ where: activeProject });
}

export function listReports() {
  return prisma.supervisionReport.findMany({
    where: activeProject,
    orderBy: { reportDate: "desc" },
    include: { project: true },
  });
}
