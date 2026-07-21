import { NextResponse } from "next/server";

import * as ehsService from "@/service/ehs.service";
import * as storage from "@/service/storage.service";
import { getCurrentUser } from "@/service/auth.service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("未登入", { status: 401 });

  const { id } = await params;
  const attachment = await ehsService.getAttachment(id);
  if (!attachment) return new NextResponse("找不到檔案", { status: 404 });

  const buffer = await storage.read(attachment.storedName);
  if (!buffer) return new NextResponse("找不到檔案", { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        attachment.fileName,
      )}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
