import { NextResponse } from "next/server";

import type { FaithMessage, FaithAttachment } from "@/service/faith.service";
import { extractDocumentText } from "@/service/docExtract.service";
import { getCurrentUser } from "@/service/auth.service";
import { archiveAttachment, lastUserText } from "@/service/faithArchive";
import {
  runExtraction,
  type WizardDraft,
  type WizardEvent,
} from "@/service/wizardExtract.service";
import type { WizardStepId } from "@/service/wizard-steps";
import { withLogContext } from "@/service/faithLog.service";

export const runtime = "nodejs";

type Body = {
  messages?: FaithMessage[];
  attachment?: FaithAttachment;
  known?: Partial<WizardDraft>;
  /** 目前鎖定的專案；建立新案時通常為 null，歸為未指派。 */
  projectId?: string | null;
  /** 僅重跑指定段落（單段重試）。 */
  only?: WizardStepId[];
  /** 對話與本次送出的識別，供互動紀錄與評價對應。 */
  conversationId?: string;
  turnId?: string;
};

/**
 * 專案建置的分段解析。
 *
 * 以 NDJSON 串流回應（每行一個事件），讓費思能邊解析邊回報：
 *   {"type":"archived",...}
 *   {"type":"status","step":"profile","state":"running"}
 *   {"type":"data","step":"profile","fields":{...}}
 *   {"type":"status","step":"profile","state":"done","count":9,"total":11}
 *   … 其餘三段 …
 *   {"type":"done","failed":[]}
 *
 * 不使用單一 JSON 回應，是因為四段合計耗時較長，
 * 使用者需要在過程中就看到已擷取的內容。
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

  const att = body.attachment?.data ? body.attachment : undefined;

  // 先歸檔：契約書、決標公告等文件本身就是專案文件，
  // 即使格式不受支援或判讀失敗，也應留在檔案管理可供調閱。
  const { archived, archiveError } = await archiveAttachment(att, {
    projectId: body.projectId ?? null,
    taskId: "project-wizard",
    taskTitle: "專案建置",
    prompt: lastUserText(body.messages),
  });

  // Office／純文字檔先在伺服器端轉文字；PDF 與影像維持原生 inlineData。
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
          // 格式雖無法判讀，檔案已歸檔，於檔案管理仍可調閱
          archived,
          archiveError,
        },
        { status: 415 },
      );
    }
  }

  const encoder = new TextEncoder();
  const line = (obj: unknown) => encoder.encode(`${JSON.stringify(obj)}\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 歸檔結果先送，讓使用者最先看到「檔案已入庫」
        controller.enqueue(line({ type: "archived", archived, archiveError }));

        // 四段解析共用同一份紀錄脈絡，四次模型呼叫都會歸屬到這次送出
        await withLogContext(
          {
            conversationId: body.conversationId,
            turnId: body.turnId,
            route: "/api/projects/wizard",
            userId: user.id,
            userName: user.name,
          },
          async () => {
            for await (const event of runExtraction({
              messages: Array.isArray(body.messages) ? body.messages : [],
              documentText,
              attachment: inline,
              known: body.known,
              only: body.only,
            })) {
              controller.enqueue(line(event satisfies WizardEvent));
            }
          },
        );
      } catch (error) {
        // 編排層本身的例外（非單段失敗）也以事件形式送出，
        // 前端才能顯示原因而不是靜默中斷
        const message =
          error instanceof Error ? error.message : "專案建置判讀失敗";
        controller.enqueue(line({ type: "error", error: message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // 關閉代理層緩衝，否則串流會被整批送出而失去即時性
      "X-Accel-Buffering": "no",
    },
  });
}
