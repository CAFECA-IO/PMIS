import { NextResponse } from "next/server";

import * as faith from "@/service/faith.service";
import type { FaithMessage, FaithAttachment } from "@/service/faith.service";
import { getCurrentUser } from "@/service/auth.service";
import { archiveAttachment, lastUserText } from "@/service/faithArchive";
import { logNote, withLogContext } from "@/service/faithLog.service";
import { toFaithError } from "@/service/faith-error";
import { retrieveForChat } from "@/service/chatRetrieve.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // 此路由先前完全未驗證，任何人都能呼叫 AI 並上傳檔案
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      messages?: FaithMessage[];
      attachment?: FaithAttachment;
      /** 目前鎖定的專案（側邊欄 ?project=），未鎖定時歸為未指派。 */
      projectId?: string | null;
      /** 對話與本次送出的識別，供互動紀錄與評價對應。 */
      conversationId?: string;
      turnId?: string;
    };

    // 先歸檔再送模型：即使判讀失敗，使用者上傳的檔案仍留存於檔案管理
    const { archived, archiveError } = await archiveAttachment(body.attachment, {
      projectId: body.projectId ?? null,
      prompt: lastUserText(body.messages),
    });

    // 於紀錄脈絡內執行，模型閘道即可把這次往返歸屬到同一對話與同一次送出
    const { text, note } = await withLogContext(
      {
        conversationId: body.conversationId,
        turnId: body.turnId,
        route: "/api/chat",
        userId: user.id,
        userName: user.name,
      },
      async () => {
        const messages = body.messages ?? [];
        // 先判斷這個問題需不需要調閱本專案的資料，再據以回答。
        // 檢索失敗不會拋錯，只會回「沒讀到東西」，對話照常進行。
        const retrieval = await retrieveForChat({
          projectId: body.projectId,
          messages,
          viewer: user,
        });
        await logNote("chat:retrieval", retrieval.log);
        return {
          text: await faith.chat(messages, body.attachment, {
            context: retrieval.context,
            attachments: retrieval.attachments,
          }),
          note: retrieval.note,
        };
      },
    );
    // note 是「參考了哪些資料」的說明，由面板附在回答下方以供追溯
    return NextResponse.json({ text, note, archived, archiveError });
  } catch (error) {
    const message =
      toFaithError(error).message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
