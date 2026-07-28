import { NextResponse } from "next/server";

import * as ehsService from "@/service/ehs.service";
import * as storage from "@/service/storage.service";
import * as memberRepo from "@/repository/projectMember.repository";
import { getCurrentUser } from "@/service/auth.service";
import { canReadFile } from "@/service/file-access";
import { fileResponse, wantsDownload } from "@/lib/file-response";

export const runtime = "nodejs";

/**
 * 環安衛稽核附件的取檔。
 * 先前僅驗「已登入」，任何登入者都能讀取他案照片；現收斂為專案成員層級。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const attachment = await ehsService.getAttachment(id);
  if (!attachment) {
    return NextResponse.json({ error: "找不到檔案" }, { status: 404 });
  }

  const projectId = attachment.audit.projectId;
  const isMember = Boolean(await memberRepo.exists(projectId, user.id));
  const allowed = canReadFile(
    {
      id: user.id,
      role: user.role,
      memberProjectIds: isMember ? [projectId] : [],
    },
    { projectId },
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
