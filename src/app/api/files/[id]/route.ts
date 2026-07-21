import { NextResponse } from "next/server";

import * as approvalService from "@/service/approval.service";
import * as storage from "@/service/storage.service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const attachment = await approvalService.getAttachment(id);
  if (!attachment) {
    return new NextResponse("找不到檔案", { status: 404 });
  }

  const buffer = await storage.read(attachment.storedName);
  if (!buffer) {
    return new NextResponse("找不到檔案", { status: 404 });
  }

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
