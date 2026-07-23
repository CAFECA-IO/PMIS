import { NextResponse } from "next/server";

import * as documentsService from "@/service/documents.service";
import { getCurrentUser } from "@/service/auth.service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("未登入", { status: 401 });

  const { id } = await params;
  const file = await documentsService.getMediaFile(id);
  if (!file) return new NextResponse("找不到檔案", { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        file.fileName,
      )}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
