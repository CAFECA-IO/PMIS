"use server";

import { revalidatePath } from "next/cache";

import * as obligationService from "@/service/obligation.service";
import * as workItemService from "@/service/workItem.service";
import { currentUserCanEdit } from "@/service/access.service";
import { requireUser } from "@/service/auth.service";

/**
 * 履約事項的變更動作。
 *
 * 兩層把關：模組層的編輯權限（currentUserCanEdit）＋service 內的專案成員判定。
 * 先前只有前者，於是任何有履約事項編輯權的人都能完成他案的事項。
 *
 * 一律回傳結果而非靜默失敗 —— 完成被拒（歸屬分項未做完）是預期中的情況，
 * 使用者必須看到原因，否則只會覺得按鈕壞了。
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

/** 變更後要一併重整的畫面：完成與否會影響進度上捲與預警判定。 */
function refresh(obligationId: string) {
  revalidatePath(`/obligations/${obligationId}`);
  revalidatePath("/obligations");
  revalidatePath("/projects");
  revalidatePath("/schedule");
  revalidatePath("/calendar");
  revalidatePath("/");
}

/** 完成履約事項。歸屬的工程分項未全部完成時會被拒絕並回報原因。 */
export async function completeObligationAction(id: string): Promise<ActionResult> {
  if (!(await currentUserCanEdit("/obligations"))) {
    return { ok: false, error: "您沒有編輯履約事項的權限。" };
  }
  const result = await obligationService.completeObligation(
    id,
    await requireUser(),
  );
  if (result.ok) refresh(id);
  return result;
}

/** 儲存細節頁的編輯。 */
export async function updateObligationAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await currentUserCanEdit("/obligations"))) {
    return { ok: false, error: "您沒有編輯履約事項的權限。" };
  }
  const field = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  const result = await obligationService.updateObligation(
    id,
    {
      code: field("code"),
      title: field("title"),
      stage: field("stage"),
      risk: field("risk"),
      triggerType: field("triggerType"),
      status: field("status"),
      dueDate: field("dueDate"),
      actualDate: field("actualDate"),
      ownerUnit: field("ownerUnit"),
      ownerName: field("ownerName"),
      contractBasis: field("contractBasis"),
      weight: field("weight"),
      commissioning: field("commissioning"),
      offsetDays: field("offsetDays"),
      docNo: field("docNo"),
      note: field("note"),
    },
    await requireUser(),
  );
  if (result.ok) refresh(id);
  return result;
}

/** 在細節頁把某個歸屬的工程分項標記完成。 */
export async function completeWorkItemAction(
  workItemId: string,
  obligationId: string,
): Promise<ActionResult> {
  if (!(await currentUserCanEdit("/obligations"))) {
    return { ok: false, error: "您沒有編輯履約事項的權限。" };
  }
  const ok = await workItemService.completeWorkItem(
    workItemId,
    await requireUser(),
  );
  if (!ok) return { ok: false, error: "無法更新此工程分項，或您無權編輯。" };
  refresh(obligationId);
  return { ok: true };
}

/** 在細節頁調整某個歸屬工程分項的完成百分比與實際起訖日。 */
export async function updateWorkItemProgressAction(
  workItemId: string,
  obligationId: string,
  input: {
    progress?: string;
    status?: string;
    actualStart?: string;
    actualEnd?: string;
  },
): Promise<ActionResult> {
  if (!(await currentUserCanEdit("/obligations"))) {
    return { ok: false, error: "您沒有編輯履約事項的權限。" };
  }
  const ok = await workItemService.updateWorkItemProgress(
    workItemId,
    input,
    await requireUser(),
  );
  if (!ok) return { ok: false, error: "無法更新此工程分項，或您無權編輯。" };
  refresh(obligationId);
  return { ok: true };
}
