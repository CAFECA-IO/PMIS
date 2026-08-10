import { jsonFail } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

import * as fileManager from "@/service/fileManager.service";
import { getCurrentUser } from "@/service/auth.service";
import { fileResponse, wantsDownload } from "@/lib/file-response";

export const runtime = "nodejs";

/**
 * Info: (20260728 - Luphia) 檔案管理中直接上傳檔案的取檔。
 * 預設內嵌檢視（PDF／圖片），?download=1 則強制下載；
 * 權限依專案成員判定（見 fileManager.getFile）。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);

  const result = await fileManager.getFile(id, {
    id: user.id,
    role: user.role,
  });
  if (!result.ok) {
    return result.reason === "forbidden"
      ? jsonFail(API_ERRORS.FO_FILE_FORBIDDEN)
      : jsonFail(API_ERRORS.NF_FILE_NOT_FOUND);
  }

  return fileResponse(
    result.buffer,
    result.fileName,
    result.mimeType,
    wantsDownload(request.url),
  );
}
