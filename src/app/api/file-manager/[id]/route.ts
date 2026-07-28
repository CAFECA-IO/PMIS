import { NextResponse } from "next/server";

import * as fileManager from "@/service/fileManager.service";
import { getCurrentUser } from "@/service/auth.service";
import { fileResponse, wantsDownload } from "@/lib/file-response";

export const runtime = "nodejs";

/**
 * 檔案管理中直接上傳檔案的取檔。
 * 預設內嵌檢視（PDF／圖片），?download=1 則強制下載；
 * 權限依專案成員判定（見 fileManager.getFile）。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const result = await fileManager.getFile(id, {
    id: user.id,
    role: user.role,
  });
  if (!result.ok) {
    return result.reason === "forbidden"
      ? NextResponse.json({ error: "無權存取此檔案" }, { status: 403 })
      : NextResponse.json({ error: "找不到檔案" }, { status: 404 });
  }

  return fileResponse(
    result.buffer,
    result.fileName,
    result.mimeType,
    wantsDownload(request.url),
  );
}
