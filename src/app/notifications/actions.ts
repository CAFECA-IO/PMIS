"use server";

import { revalidatePath } from "next/cache";

import * as notificationService from "@/service/notification.service";
import { requireUser } from "@/service/auth.service";
import { currentUserCanEdit } from "@/service/access.service";

/**
 * 系統通知的操作。
 *
 * 已讀與釘選屬個人閱讀行為，只要能登入即可操作，不需模組編輯權限；
 * 變更處理狀態才需要編輯權限。
 */

function refresh() {
  revalidatePath("/notifications");
  // 鈴鐺常駐於版面，任何頁面都看得到，需連帶更新 layout
  revalidatePath("/", "layout");
}

/** 展開通知時自動標記已讀。 */
export async function markReadAction(id: string) {
  await requireUser();
  await notificationService.markRead(id);
  refresh();
}

export async function markAllReadAction() {
  await requireUser();
  await notificationService.markAllRead();
  refresh();
}

/** 釘選／取消釘選，讓通知固定顯示於釘選區。 */
export async function togglePinAction(id: string, pinned: boolean) {
  await requireUser();
  await notificationService.setPinned(id, pinned);
  refresh();
}

// Info: 變更處理狀態
export async function setNotificationStatusAction(id: string, status: string) {
  await requireUser();
  if (!(await currentUserCanEdit("/notifications"))) return;
  await notificationService.setStatus(id, status);
  refresh();
}
