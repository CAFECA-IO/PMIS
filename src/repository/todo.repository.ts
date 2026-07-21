import { prisma } from "./client";
import type { TodoStatus } from "@/generated/prisma/enums";

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

export function markRead(id: string) {
  return prisma.todoItem.update({ where: { id }, data: { readAt: new Date() } });
}

export function setStatus(id: string, status: TodoStatus) {
  return prisma.todoItem.update({ where: { id }, data: { status } });
}
