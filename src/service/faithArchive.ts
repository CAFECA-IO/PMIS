import { getCurrentUser } from "@/service/auth.service";
import * as faithUpload from "@/service/faithUpload.service";
import type { FaithAttachment } from "@/service/faith.service";

/**
 * AI 路由共用的歸檔入口。
 *
 * 設計取捨：歸檔在「送給模型之前」執行，且歸檔失敗不中斷 AI 流程 ——
 * 使用者已經上傳了檔案，不該因為模型判讀失敗或寫檔失敗就整個請求作廢。
 * 失敗時回傳 archiveError，由路由附在回應中提示，前端可據以顯示警示。
 */

export type ArchivedInfo = {
  /** 歸檔紀錄 id，供前端組出檢視／下載連結。 */
  id: string;
  fileName: string;
  size: number;
  /** 檢視連結（可內嵌者於瀏覽器開啟，否則觸發下載）。 */
  url: string;
  downloadUrl: string;
};

export type ArchiveOutcome = {
  archived?: ArchivedInfo;
  archiveError?: string;
};

export type ArchiveContext = {
  projectId?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  /** 對話中最後一則使用者訊息，作為上傳當時的意圖紀錄。 */
  prompt?: string | null;
};

/**
 * 歸檔一份費思附件。無附件時回傳空物件。
 * 呼叫端須已完成登入驗證；此處再取一次使用者以取得 id／name／role。
 */
export async function archiveAttachment(
  attachment: FaithAttachment | undefined,
  context: ArchiveContext = {},
): Promise<ArchiveOutcome> {
  if (!attachment?.data) return {};

  const user = await getCurrentUser();
  if (!user) return { archiveError: "未登入，檔案未歸檔。" };

  try {
    const result = await faithUpload.archive(
      {
        fileName: attachment.name ?? null,
        mimeType: attachment.mimeType ?? null,
        data: attachment.data,
        projectId: context.projectId ?? null,
        taskId: context.taskId ?? null,
        taskTitle: context.taskTitle ?? null,
        prompt: context.prompt ?? null,
      },
      { id: user.id, name: user.name, role: user.role },
    );

    if (!result.ok) return { archiveError: result.error };

    return {
      archived: {
        id: result.id,
        fileName: result.fileName,
        size: result.size,
        url: `/api/faith/file/${result.id}`,
        downloadUrl: `/api/faith/file/${result.id}?download=1`,
      },
    };
  } catch (error) {
    // 歸檔問題不應讓 AI 請求失敗，僅回報訊息
    const message =
      error instanceof Error ? error.message : "檔案歸檔時發生未預期錯誤。";
    return { archiveError: message };
  }
}

/** 從訊息陣列取最後一則使用者文字，作為 prompt 紀錄。 */
export function lastUserText(
  messages: { role: string; text?: string }[] | undefined,
): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === "user" && m.text?.trim()) return m.text;
  }
  return null;
}
