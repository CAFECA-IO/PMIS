import { NextResponse } from "next/server";

import type { FaithAttachment, FaithMessage } from "@/service/faith.service";
import * as faith from "@/service/faith.service";
import { extractDocumentText } from "@/service/docExtract.service";
import { getCurrentUser } from "@/service/auth.service";
import { archiveAttachment, lastUserText } from "@/service/faithArchive";
import { withLogContext } from "@/service/faithLog.service";
import { findAssistSpec } from "@/constant/form-assist";
import { sanitizePatch, validateSpec } from "@/service/form-assist";

export const runtime = "nodejs";

type Body = {
  /** 表單規格識別；規格本身在伺服器端查表，前端不得自訂。 */
  specId?: string;
  messages?: FaithMessage[];
  attachment?: FaithAttachment;
  projectId?: string | null;
  conversationId?: string;
  turnId?: string;
};

/**
 * 通用表單助手：依欄位規格判讀使用者提供的文件或描述，回傳欄位值。
 *
 * 規格由 specId 在伺服器端查表，而非由請求帶入完整 schema：
 * 否則等於讓前端自訂送進模型的結構與說明文字。
 *
 * 回傳的 patch 已依欄位型別驗證過（選項、日期、數字），
 * 不合法的值會被丟棄並列在 rejected，由前端告知使用者手動確認。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const spec = findAssistSpec(body.specId);
  if (!spec) {
    return NextResponse.json({ error: "未知的表單" }, { status: 400 });
  }
  // 規格寫錯時明確報錯，而不是送出模型會拒收的 schema
  const problems = validateSpec(spec);
  if (problems.length > 0) {
    return NextResponse.json(
      { error: `表單規格有誤：${problems.join("；")}` },
      { status: 500 },
    );
  }

  const att = body.attachment?.data ? body.attachment : undefined;

  // 先歸檔：使用者上傳的憑證、報告本身就是專案文件，
  // 即使判讀失敗也應留在檔案管理可供調閱
  const { archived, archiveError } = await archiveAttachment(att, {
    projectId: body.projectId ?? null,
    taskId: `form-assist:${spec.id}`,
    taskTitle: spec.title,
    prompt: lastUserText(body.messages),
  });

  // Office／純文字檔先在伺服器端轉文字；PDF 與影像維持原生 inlineData
  let inline: FaithAttachment | undefined;
  let documentText: string | undefined;
  if (att) {
    const buf = new Uint8Array(Buffer.from(att.data, "base64"));
    const result = extractDocumentText(buf, att.mimeType, att.name);
    if (result.kind === "native") {
      inline = att;
    } else if (result.kind === "text") {
      documentText =
        `檔名：${att.name ?? "未命名"}\n` +
        (result.truncated ? "（內容過長，僅擷取前段）\n" : "") +
        result.text;
    } else {
      return NextResponse.json(
        {
          error: `不支援的檔案格式${att.name ? `：${att.name}` : ""}。可上傳 PDF、圖片、Word (.docx)、Excel (.xlsx)、PowerPoint (.pptx) 或純文字檔。`,
          archived,
          archiveError,
        },
        { status: 415 },
      );
    }
  }

  try {
    const result = await withLogContext(
      {
        conversationId: body.conversationId,
        turnId: body.turnId,
        route: "/api/forms/assist",
        userId: user.id,
        userName: user.name,
      },
      () =>
        faith.extractFormFields(spec, {
          messages: Array.isArray(body.messages) ? body.messages : [],
          documentText,
          attachment: inline,
        }),
    );

    const { patch, rejected } = sanitizePatch(spec.fields, result.data);
    return NextResponse.json({
      specId: spec.id,
      patch,
      rejected,
      reply: result.reply,
      archived,
      archiveError,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "表單判讀發生未預期錯誤。";
    return NextResponse.json({ error: message, archived }, { status: 500 });
  }
}
