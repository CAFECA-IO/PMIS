import { NextResponse } from "next/server";

import * as faith from "@/service/faith.service";
import { getCurrentUser } from "@/service/auth.service";
import { archiveAttachment } from "@/service/faithArchive";
import { toFaithError } from "@/service/faith-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      mimeType?: string;
      data?: string;
      fileName?: string;
      projectId?: string | null;
    };
    if (!body.data) {
      return NextResponse.json({ error: "缺少影像內容" }, { status: 400 });
    }

    // 先歸檔：影像本身是原始憑據，判讀結果僅為輔助，檔案應留存可查
    const { archived, archiveError } = await archiveAttachment(
      {
        mimeType: body.mimeType ?? "application/octet-stream",
        data: body.data,
        name: body.fileName,
      },
      {
        projectId: body.projectId ?? null,
        taskId: "ehs-analyze",
        taskTitle: "環安衛影像判讀",
      },
    );
    const fields = await faith.extractEhsFinding(
      body.data,
      body.mimeType ?? "application/octet-stream",
    );
    return NextResponse.json({ fields, archived, archiveError });
  } catch (error) {
    const message = toFaithError(error).message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
