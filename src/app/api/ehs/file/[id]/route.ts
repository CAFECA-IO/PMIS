import { NextResponse } from "next/server";

import * as ehsService from "@/service/ehs.service";
import { getCurrentUser } from "@/service/auth.service";
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
  // 取檔與權限判定收斂到 service：先前這裡自帶一份，
  // 費思對話檢索也需要同樣的判斷，兩份實作遲早會漂移
  const file = await ehsService.getAttachmentFile(id, user);
  if (!file.ok) {
    return file.reason === "forbidden"
      ? NextResponse.json({ error: "無權存取此檔案" }, { status: 403 })
      : NextResponse.json({ error: "找不到檔案" }, { status: 404 });
  }

  return fileResponse(
    file.buffer,
    file.fileName,
    file.mimeType,
    wantsDownload(request.url),
  );
}
