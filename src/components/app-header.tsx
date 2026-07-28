"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import type { AccountRole } from "@/generated/prisma/enums";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { useShell } from "@/components/shell-context";
import { hidesSidebar } from "@/lib/layout-rules";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/service/notification-order";

/**
 * 全站頂列。
 *
 * 用戶登入資訊與通知鈴鐺一律放在此處，手機與桌機都在同一位置、
 * 進站第一眼即可見（不藏在側邊欄或漢堡選單內）。
 */
export function AppHeader({
  user,
  notifications,
  onMarkRead,
  onTogglePin,
}: {
  user: { name: string; email: string; role: AccountRole };
  notifications: NotificationItem[];
  onMarkRead: (id: string) => Promise<void>;
  onTogglePin: (id: string, pinned: boolean) => Promise<void>;
}) {
  const { toggleNav } = useShell();
  const pathname = usePathname();
  /*
    側邊欄被隱藏的畫面（如專案建置），桌機也要顯示漢堡鈕與品牌，
    否則使用者會失去導覽入口、畫面上也看不到 logo。
  */
  const navHidden = hidesSidebar(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 sm:px-4">
      {/* 手機：漢堡開選單；桌機側邊欄常駐故隱藏 */}
      <button
        type="button"
        onClick={toggleNav}
        aria-label="開啟選單"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          navHidden ? "" : "lg:hidden",
        )}
      >
        <Menu className="size-5" />
      </button>

      {/* 手機顯示品牌（桌機側邊欄已有 logo，不重複） */}
      <div
        className={cn(
          "flex items-center gap-2",
          navHidden ? "" : "lg:hidden",
        )}
      >
        <Logo className="h-7 w-auto" />
        <span className="text-sm font-semibold">PMIS</span>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <NotificationBell
          items={notifications}
          onMarkRead={onMarkRead}
          onTogglePin={onTogglePin}
        />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
