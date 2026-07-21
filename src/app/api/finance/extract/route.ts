import { NextResponse } from "next/server";

import * as aiService from "@/service/ai.service";
import { getCurrentUser } from "@/service/auth.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  try {
    const body = (await request.json()) as { mimeType?: string; data?: string };
    if (!body.data) {
      return NextResponse.json({ error: "缺少檔案內容" }, { status: 400 });
    }
    const fields = await aiService.extractVoucher(
      body.data,
      body.mimeType ?? "application/octet-stream",
    );
    return NextResponse.json({ fields });
  } catch (error) {
    const message = error instanceof Error ? error.message : "憑證判讀失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
