import { prisma } from "./client";

/** 設備清單（含最後心跳，供離線分鐘數評估）。 */
export function listByProjects(projectIds: string[]) {
  return prisma.monitoringDevice.findMany({
    where: { deletedAt: null, projectId: { in: projectIds } },
    orderBy: { code: "asc" },
    include: { project: { select: { id: true, name: true } } },
  });
}

export function listAll() {
  return prisma.monitoringDevice.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
    include: { project: { select: { id: true, name: true } } },
  });
}
