import { prisma } from "./client";
import type { NotificationStatus } from "@/generated/prisma/enums";

/** 系統通知的資料存取。 */

const activeProject = { project: { deletedAt: null } };

const SELECT = {
  id: true,
  title: true,
  detail: true,
  link: true,
  source: true,
  unit: true,
  dueDate: true,
  status: true,
  readAt: true,
  pinnedAt: true,
  createdAt: true,
  project: { select: { name: true } },
} as const;

/** 通知清單（排序交由 notification-order 純函式處理）。 */
export function list() {
  return prisma.notification.findMany({
    where: activeProject,
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
}

export function countUnread() {
  return prisma.notification.count({
    where: { readAt: null, ...activeProject },
  });
}

export function markRead(id: string) {
  return prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
}

export function markAllRead() {
  return prisma.notification.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  });
}

export function setPinned(id: string, pinned: boolean) {
  return prisma.notification.update({
    where: { id },
    data: { pinnedAt: pinned ? new Date() : null },
  });
}

export function count() {
  return prisma.notification.count({ where: activeProject });
}

export function countOverdue() {
  return prisma.notification.count({
    where: { status: "OVERDUE", ...activeProject },
  });
}

export function setStatus(id: string, status: NotificationStatus) {
  return prisma.notification.update({ where: { id }, data: { status } });
}
