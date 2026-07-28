import { Bell } from "lucide-react";

import * as notificationService from "@/service/notification.service";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess } from "@/service/access.service";
import { NotificationList } from "./notification-list";
import { markAllReadAction, markReadAction, togglePinAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "系統通知 — PMIS" };

export default async function NotificationsPage() {
  const user = await requireUser();
  await assertModuleAccess(user, "/notifications");
  const { pinned, inbox, unreadCount } =
    await notificationService.listNotifications();

  return (
    <>
      <PageHeader
        section="01 總覽與決策"
        title="系統通知"
        description="各模組產生的提醒與待處理事項；可釘選重要訊息並前往對應功能處理"
        action={
          unreadCount > 0 ? (
            <Badge variant="destructive">{unreadCount} 則未讀</Badge>
          ) : (
            <Badge variant="success">全部已讀</Badge>
          )
        }
      />
      <div className="p-8">
        {pinned.length === 0 && inbox.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
            <Bell className="size-6 opacity-60" />
            目前沒有系統通知。
          </div>
        ) : (
          <div className="max-w-4xl">
            <NotificationList
              pinned={pinned}
              inbox={inbox}
              unreadCount={unreadCount}
              onMarkRead={markReadAction}
              onMarkAllRead={markAllReadAction}
              onTogglePin={togglePinAction}
            />
          </div>
        )}
      </div>
    </>
  );
}
