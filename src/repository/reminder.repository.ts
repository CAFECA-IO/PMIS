import { prisma } from "./client";

const activeProject = { project: { deletedAt: null } };

export function listWithProject() {
  return prisma.reminderEvent.findMany({
    where: activeProject,
    orderBy: { dueDate: "asc" },
    include: { project: true },
  });
}

export function listUpcoming(take: number) {
  return prisma.reminderEvent.findMany({
    take,
    where: { status: { not: "DONE" }, ...activeProject },
    orderBy: { dueDate: "asc" },
    include: { project: true },
  });
}

export function count() {
  return prisma.reminderEvent.count({ where: activeProject });
}
