import { jsonFail } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

import * as ehsService from "@/service/ehs.service";
import { getCurrentUser } from "@/service/auth.service";
import { fileResponse, wantsDownload } from "@/lib/file-response";

export const runtime = "nodejs";

/**
 * Info: (20260730 - Luphia) 環安衛稽核附件的取檔。
 * 先前僅驗「已登入」，任何登入者都能讀取他案照片；現收斂為專案成員層級。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);

  const { id } = await params;
  // Info: (20260730 - Luphia) 取檔與權限判定收斂到 service：先前這裡自帶一份，
  // Info: (20260730 - Luphia) 費思對話檢索也需要同樣的判斷，兩份實作遲早會漂移
  const file = await ehsService.getAttachmentFile(id, user);
  if (!file.ok) {
    return file.reason === "forbidden"
      ? jsonFail(API_ERRORS.FO_FILE_FORBIDDEN)
      : jsonFail(API_ERRORS.NF_FILE_NOT_FOUND);
  }

  return fileResponse(
    file.buffer,
    file.fileName,
    file.mimeType,
    wantsDownload(request.url),
  );
}
