"use server";

import { revalidatePath } from "next/cache";

import * as ledgerService from "@/service/ledger.service";
import { currentUserCanEdit } from "@/service/access.service";
import { requireUser } from "@/service/auth.service";

/**
 * 估驗台帳的數量維護。
 *
 * 兩層把關：模組層的編輯權限＋service 內的專案成員判定。
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateLedgerQtyAction(
  workItemId: string,
  projectId: string,
  input: ledgerService.LedgerQtyInput,
): Promise<ActionResult> {
  if (!(await currentUserCanEdit("/projects"))) {
    return { ok: false, error: "您沒有編輯專案的權限。" };
  }
  const result = await ledgerService.updateLedgerQty(
    workItemId,
    input,
    await requireUser(),
  );
  if (!result.ok) return result;

  // 數量會改動 progress，因此進度相關的畫面一併重整
  revalidatePath(`/projects/${projectId}/ledger`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/schedule");
  revalidatePath("/obligations");
  revalidatePath("/");
  return { ok: true };
}
