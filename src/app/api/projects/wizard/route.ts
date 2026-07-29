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
import * as faithUpload from "@/service/faithUpload.service";
import type { AccountRole } from "@/generated/prisma/enums";
import { toFaithError } from "@/service/faith-error";

export const runtime = "nodejs";

type Body = {
  messages?: FaithMessage[];
  attachment?: FaithAttachment;
  known?: Partial<WizardDraft>;
  /** 目前鎖定的專案；建立新案時通常為 null，歸為未指派。 */
  projectId?: string | null;
  /** 僅重跑指定段落（單段重試）。 */
  only?: WizardStepId[];
  /**
   * 本次建置已歸檔的檔案 id。
   *
   * 契約全文只存在於上傳那一次的請求裡；後續送出與單段重試都不帶附件。
   * 前端把歸檔 id 帶回來，伺服器據以重讀契約再轉文字，
   * 否則依賴契約的三段會在沒有文件的情況下憑常識編造內容。
   */
  documentUploadIds?: string[];
  /** 對話與本次送出的識別，供互動紀錄與評價對應。 */
  conversationId?: string;
  turnId?: string;
};

/** 一次最多重讀幾份歸檔文件，避免請求被拉長。 */
const MAX_REREAD = 3;

/**
 * 由歸檔重新取得契約文字。
 *
 * 只取能轉成文字的檔案；PDF 與影像需以 inlineData 交模型原生判讀，
 * 無法在此重建，故略過（這類情況會由 skipReason 明確告知使用者重新上傳）。
 */
async function textFromArchive(
  ids: string[] | undefined,
  viewer: { id: string; role: AccountRole },
): Promise<string | undefined> {
  if (!ids?.length) return undefined;
  const parts: string[] = [];

  for (const id of ids.slice(0, MAX_REREAD)) {
    const file = await faithUpload.getFile(id, viewer);
    if (!file.ok) continue;
    const result = extractDocumentText(
      new Uint8Array(file.buffer),
      file.mimeType,
      file.fileName,
    );
    if (result.kind !== "text") continue;
    parts.push(
      `檔名：${file.fileName}\n` +
        (result.truncated ? "（內容過長，僅擷取前段）\n" : "") +
        result.text,
    );
  }

  return parts.length ? parts.join("\n\n") : undefined;
}

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

  /*
    本次沒有附件時，改由歸檔重讀契約。
    這是「補一個專案編號卻讓履約事項被重新編造」的根本修正：
    先前後續送出與單段重試都不帶檔案，模型無文件可讀仍照跑。
  */
  if (!att) {
    documentText = await textFromArchive(body.documentUploadIds, {
      id: user.id,
      role: user.role,
    });
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
          toFaithError(error).message;
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
