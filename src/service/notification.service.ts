import * as repo from "@/repository/notification.repository";
import type { NotificationStatus } from "@/generated/prisma/enums";
import {
  groupNotifications,
  type GroupedNotifications,
  type NotificationItem,
} from "@/service/notification-order";

/**
 * 系統通知。
 * 本檔負責 I/O 與型別轉換；分組與排序一律交由 notification-order（已單元測試）。
 */

const VALID_STATUS: NotificationStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "DONE",
  "OVERDUE",
];

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** 通知清單，已分為釘選區與一般清單並附未讀數。 */
export async function listNotifications(): Promise<GroupedNotifications> {
  const rows = await repo.list();
  const items: NotificationItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    detail: r.detail,
    link: r.link,
    source: r.source,
    unit: r.unit,
    projectName: r.project?.name ?? null,
    dueDate: iso(r.dueDate),
    status: r.status,
    readAt: iso(r.readAt),
    pinnedAt: iso(r.pinnedAt),
    createdAt: r.createdAt.toISOString(),
  }));
  return groupNotifications(items);
}

/** 展開通知時標記已讀。 */
export async function markRead(id: string) {
  await repo.markRead(id);
}

export async function markAllRead() {
  await repo.markAllRead();
}

/** 釘選／取消釘選，讓通知固定顯示於釘選區。 */
export async function setPinned(id: string, pinned: boolean) {
  await repo.setPinned(id, pinned);
}

/** 變更處理狀態（已處理 = DONE）。 */
export async function setStatus(id: string, status: string) {
  const next: NotificationStatus = VALID_STATUS.includes(
    status as NotificationStatus,
  )
    ? (status as NotificationStatus)
    : "PENDING";
  await repo.setStatus(id, next);
}
