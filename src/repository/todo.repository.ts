import { prisma } from "./client";

const activeProject = { project: { deletedAt: null } };

export function listWithProject() {
  return prisma.todoItem.findMany({
    where: activeProject,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: { project: true },
  });
}

export function count() {
  return prisma.todoItem.count({ where: activeProject });
}

export function countOverdue() {
  return prisma.todoItem.count({
    where: { status: "OVERDUE", ...activeProject },
  });
}
