/**
 * 系統通知的分組與排序（純函式，無 I/O，便於單元測試）。
 *
 * 呈現規則：
 *  - 釘選的訊息固定顯示於「釘選」區，最新釘選在前
 *  - 其餘依「未讀優先 → 到期日近者優先 → 建立時間新者優先」
 *  - 未讀數只計未讀，釘選與否不影響計數
 */

export type NotificationItem = {
  id: string;
  title: string;
  detail: string | null;
  link: string | null;
  source: string | null;
  unit: string | null;
  projectName: string | null;
  /** ISO 字串或 null */
  dueDate: string | null;
  status: string;
  readAt: string | null;
  pinnedAt: string | null;
  createdAt: string;
};

const time = (v: string | null) => (v ? new Date(v).getTime() : null);

/** 未讀數量（不含已讀，釘選不影響）。 */
export function countUnread(items: NotificationItem[]): number {
  return items.filter((n) => n.readAt === null).length;
}

/** 未讀優先 → 期限近者優先（無期限排後）→ 建立時間新者優先。 */
function compareInbox(a: NotificationItem, b: NotificationItem): number {
  const aUnread = a.readAt === null ? 0 : 1;
  const bUnread = b.readAt === null ? 0 : 1;
  if (aUnread !== bUnread) return aUnread - bUnread;

  const ad = time(a.dueDate);
  const bd = time(b.dueDate);
  if (ad !== bd) {
    if (ad === null) return 1;
    if (bd === null) return -1;
    return ad - bd;
  }

  return (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0);
}

/** 釘選時間新者在前。 */
function comparePinned(a: NotificationItem, b: NotificationItem): number {
  return (time(b.pinnedAt) ?? 0) - (time(a.pinnedAt) ?? 0);
}

export type GroupedNotifications = {
  pinned: NotificationItem[];
  inbox: NotificationItem[];
  unreadCount: number;
};

/** 分成釘選區與一般清單，各自排序。 */
export function groupNotifications(
  items: NotificationItem[],
): GroupedNotifications {
  const pinned = items.filter((n) => n.pinnedAt !== null).sort(comparePinned);
  const inbox = items.filter((n) => n.pinnedAt === null).sort(compareInbox);
  return { pinned, inbox, unreadCount: countUnread(items) };
}

/** 未讀數顯示文字：超過 99 顯示 99+。 */
export function formatBadge(count: number): string {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}
