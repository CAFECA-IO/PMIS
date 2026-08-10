import { jsonFail } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

import * as approvalService from "@/service/approval.service";
import * as storage from "@/service/storage.service";
import { getCurrentUser } from "@/service/auth.service";
import { canReadApprovalFile } from "@/service/file-access";
import { fileResponse, wantsDownload } from "@/lib/file-response";

export const runtime = "nodejs";

/**
 * Info: (20260728 - Luphia) 簽核文件附件的取檔。
 *
 * 此路由先前完全沒有任何檢查 —— 知道 id 即可取得檔案。
 * ApprovalDocument 不隸屬專案，故權限收斂到「與該簽核案有關的人」：
 * 全案檢視者、申請人、或流程關卡指定職位的持有者（見 file-access）。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);

  const { id } = await params;
  const attachment = await approvalService.getAttachment(id);
  if (!attachment) {
    return jsonFail(API_ERRORS.NF_FILE_NOT_FOUND);
  }

  const allowed = canReadApprovalFile(
    { id: user.id, role: user.role, positionId: user.positionId },
    {
      applicantId: attachment.document.applicantId,
      stepPositionIds: attachment.document.steps.map((s) => s.positionId),
    },
  );
  if (!allowed) {
    return jsonFail(API_ERRORS.FO_FILE_FORBIDDEN);
  }

  const buffer = await storage.read(attachment.storedName);
  if (!buffer) {
    return jsonFail(API_ERRORS.NF_FILE_NOT_FOUND);
  }

  return fileResponse(
    buffer,
    attachment.fileName,
    attachment.mimeType,
    wantsDownload(request.url),
  );
}
