import * as faith from "@/service/faith.service";
import { getCurrentUser } from "@/service/auth.service";
import { archiveAttachment } from "@/service/faithArchive";
import { toFaithError } from "@/service/faith-error";
import { jsonOk, jsonFail, jsonError } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);

  try {
    const body = (await request.json()) as {
      mimeType?: string;
      data?: string;
      fileName?: string;
      projectId?: string | null;
    };
    if (!body.data) {
      return jsonFail(API_ERRORS.VA_MISSING_FILE_CONTENT);
    }

    // Info: (20260729 - Luphia) 先歸檔：憑證本身是原始憑據，判讀結果僅為輔助，檔案應留存可查
    const { archived, archiveError } = await archiveAttachment(
      {
        mimeType: body.mimeType ?? "application/octet-stream",
        data: body.data,
        name: body.fileName,
      },
      {
        projectId: body.projectId ?? null,
        taskId: "voucher-extract",
        taskTitle: "財務憑證判讀",
      },
    );
    const fields = await faith.extractVoucher(
      body.data,
      body.mimeType ?? "application/octet-stream",
    );
    return jsonOk({ fields, archived, archiveError });
  } catch (error) {
    // Info: (20260810 - Luphia) 沿用 toFaithError 整理過的可讀訊息，語意碼統一為 IN000001
    return jsonError(error, toFaithError(error).message);
  }
}
