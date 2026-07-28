import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countUnread,
  formatBadge,
  groupNotifications,
  type NotificationItem,
} from "./notification-order";

function n(over: Partial<NotificationItem> & { id: string }): NotificationItem {
  return {
    title: `通知 ${over.id}`,
    detail: null,
    link: null,
    source: null,
    unit: null,
    projectName: null,
    dueDate: null,
    status: "PENDING",
    readAt: null,
    pinnedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    ...over,
  };
}

test("countUnread 只計未讀，釘選不影響", () => {
  const items = [
    n({ id: "a" }),
    n({ id: "b", readAt: "2026-07-02T00:00:00Z" }),
    n({ id: "c", pinnedAt: "2026-07-03T00:00:00Z" }),
  ];
  assert.equal(countUnread(items), 2);
});

test("groupNotifications 將釘選訊息分到釘選區", () => {
  const g = groupNotifications([
    n({ id: "a" }),
    n({ id: "b", pinnedAt: "2026-07-05T00:00:00Z" }),
  ]);
  assert.deepEqual(g.pinned.map((x) => x.id), ["b"]);
  assert.deepEqual(g.inbox.map((x) => x.id), ["a"]);
});

test("釘選區依釘選時間新者在前", () => {
  const g = groupNotifications([
    n({ id: "old", pinnedAt: "2026-07-01T00:00:00Z" }),
    n({ id: "new", pinnedAt: "2026-07-09T00:00:00Z" }),
    n({ id: "mid", pinnedAt: "2026-07-05T00:00:00Z" }),
  ]);
  assert.deepEqual(g.pinned.map((x) => x.id), ["new", "mid", "old"]);
});

test("一般清單未讀優先於已讀", () => {
  const g = groupNotifications([
    n({ id: "read", readAt: "2026-07-02T00:00:00Z" }),
    n({ id: "unread" }),
  ]);
  assert.deepEqual(g.inbox.map((x) => x.id), ["unread", "read"]);
});

test("同為未讀時，期限近者優先，無期限排最後", () => {
  const g = groupNotifications([
    n({ id: "none" }),
    n({ id: "late", dueDate: "2026-08-30T00:00:00Z" }),
    n({ id: "soon", dueDate: "2026-07-05T00:00:00Z" }),
  ]);
  assert.deepEqual(g.inbox.map((x) => x.id), ["soon", "late", "none"]);
});

test("期限相同時，建立時間新者優先", () => {
  const g = groupNotifications([
    n({ id: "older", createdAt: "2026-07-01T00:00:00Z" }),
    n({ id: "newer", createdAt: "2026-07-08T00:00:00Z" }),
  ]);
  assert.deepEqual(g.inbox.map((x) => x.id), ["newer", "older"]);
});

test("已讀的釘選訊息仍留在釘選區", () => {
  const g = groupNotifications([
    n({ id: "p", pinnedAt: "2026-07-05T00:00:00Z", readAt: "2026-07-06T00:00:00Z" }),
  ]);
  assert.equal(g.pinned.length, 1);
  assert.equal(g.inbox.length, 0);
  assert.equal(g.unreadCount, 0);
});

test("groupNotifications 不改動輸入陣列", () => {
  const items = [n({ id: "b", pinnedAt: "2026-07-05T00:00:00Z" }), n({ id: "a" })];
  const before = items.map((x) => x.id);
  groupNotifications(items);
  assert.deepEqual(items.map((x) => x.id), before);
});

test("formatBadge 超過 99 顯示 99+，0 顯示空字串", () => {
  assert.equal(formatBadge(0), "");
  assert.equal(formatBadge(-1), "");
  assert.equal(formatBadge(1), "1");
  assert.equal(formatBadge(99), "99");
  assert.equal(formatBadge(100), "99+");
});

test("空清單不會出錯", () => {
  const g = groupNotifications([]);
  assert.deepEqual(g, { pinned: [], inbox: [], unreadCount: 0 });
});
