import { NextResponse } from "next/server";

import * as documentsService from "@/service/documents.service";
import * as memberRepo from "@/repository/projectMember.repository";
import { getCurrentUser } from "@/service/auth.service";
import { canReadFile } from "@/service/file-access";
import { fileResponse, wantsDownload } from "@/lib/file-response";

export const runtime = "nodejs";

/**
 * 檔案管理（PMIS-13）舊版數位檔案的取檔。
 * 先前僅驗「已登入」；現收斂為專案成員層級。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const file = await documentsService.getMediaFile(id);
  if (!file) {
    return NextResponse.json({ error: "找不到檔案" }, { status: 404 });
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
    return NextResponse.json({ error: "無權存取此檔案" }, { status: 403 });
  }

  return fileResponse(
    file.buffer,
    file.fileName,
    file.mimeType,
    wantsDownload(request.url),
  );
}
