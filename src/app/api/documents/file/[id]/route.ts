import { jsonFail } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

import * as documentsService from "@/service/documents.service";
import * as memberRepo from "@/repository/projectMember.repository";
import { getCurrentUser } from "@/service/auth.service";
import { canReadFile } from "@/service/file-access";
import { fileResponse, wantsDownload } from "@/lib/file-response";

export const runtime = "nodejs";

/**
 * Info: (20260728 - Luphia) 檔案管理（PMIS-13）舊版數位檔案的取檔。
 * 先前僅驗「已登入」；現收斂為專案成員層級。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);

  const { id } = await params;
  const file = await documentsService.getMediaFile(id);
  if (!file) {
    return jsonFail(API_ERRORS.NF_FILE_NOT_FOUND);
  }

  const isMember = Boolean(await memberRepo.exists(file.projectId, user.id));
  const allowed = canReadFile(
    {
      id: user.id,
      role: user.role,
      memberProjectIds: isMember ? [file.projectId] : [],
    },
    { projectId: file.projectId },
  );
  if (!allowed) {
    return jsonFail(API_ERRORS.FO_FILE_FORBIDDEN);
  }

  return fileResponse(
    file.buffer,
    file.fileName,
    file.mimeType,
    wantsDownload(request.url),
  );
}
