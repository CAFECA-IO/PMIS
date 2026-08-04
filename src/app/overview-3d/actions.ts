"use server";

import { revalidatePath } from "next/cache";

import * as workItemService from "@/service/workItem.service";
import type { DesignedWorkItem } from "@/service/workItem.service";
import * as designService from "@/service/designVersion.service";
import { requireUser } from "@/service/auth.service";
import { currentUserCanEdit } from "@/service/access.service";

/**
 * 取某一版設計的完整內容（含動畫網頁）。
 *
 * 版本清單不含 html（數十 KB／版，全帶會拖慢頁面載入），
 * 使用者切換到某一版時才按需取回。
 */
export async function getDesignVersionAction(id: string) {
  const user = await requireUser();
  return designService.getVersion(id, { id: user.id, role: user.role });
}

export type AddDesignResult = {
  ok: boolean;
  added: number;
  skipped: number;
  error?: string;
};

/**
 * 把「3D 施工設計」定案的工程分項加入指定專案。
 *
 * 定案不再走專案建置精靈（那是「建立新專案」的流程）——
 * 此處直接把分項寫入目前鎖定的既有專案，寫入後刷新相關頁面，
 * 使用者可立即在時程進度與估驗台帳看到這些分項。
 *
 * 權限沿用工程專案模組的編輯權限；服務層另會檢查此人是否為該案成員。
 */
export async function addDesignedWorkItemsAction(
  projectId: string,
  items: DesignedWorkItem[],
): Promise<AddDesignResult> {
  if (!(await currentUserCanEdit("/projects"))) {
    return { ok: false, added: 0, skipped: 0, error: "權限不足，無法新增工程分項。" };
  }
  if (!projectId) {
    return { ok: false, added: 0, skipped: 0, error: "缺少專案。" };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, added: 0, skipped: 0, error: "沒有可加入的工程分項。" };
  }

  const user = await requireUser();
  const result = await workItemService.addDesignedWorkItems(
    projectId,
    items,
    { id: user.id, role: user.role },
  );

  if (result.ok && result.added > 0) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/ledger`);
    revalidatePath("/projects");
    revalidatePath("/schedule");
    revalidatePath("/overview-3d");
    revalidatePath("/");
  }
  return result;
}
