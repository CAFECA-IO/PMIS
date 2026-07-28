import { NextResponse } from "next/server";

import * as approvalService from "@/service/approval.service";
import * as storage from "@/service/storage.service";
import { getCurrentUser } from "@/service/auth.service";
import { canReadApprovalFile } from "@/service/file-access";
import { fileResponse, wantsDownload } from "@/lib/file-response";

export const runtime = "nodejs";

/**
 * 簽核文件附件的取檔。
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
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const attachment = await approvalService.getAttachment(id);
  if (!attachment) {
    return NextResponse.json({ error: "找不到檔案" }, { status: 404 });
  }

  const allowed = canReadApprovalFile(
    { id: user.id, role: user.role, positionId: user.positionId },
    {
      applicantId: attachment.document.applicantId,
      stepPositionIds: attachment.document.steps.map((s) => s.positionId),
    },
  );
  if (!allowed) {
    return NextResponse.json({ error: "無權存取此檔案" }, { status: 403 });
  }

  const buffer = await storage.read(attachment.storedName);
  if (!buffer) {
    return NextResponse.json({ error: "找不到檔案" }, { status: 404 });
  }

  return fileResponse(
    buffer,
    attachment.fileName,
    attachment.mimeType,
    wantsDownload(request.url),
  );
}
