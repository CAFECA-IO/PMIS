import { NextResponse } from "next/server";

import { getCurrentUser } from "@/service/auth.service";
import { logFeedback } from "@/service/faithLog.service";

export const runtime = "nodejs";

/**
 * 使用者對某則費思回答的評價。
 *
 * 與互動紀錄寫入同一個資料夾、同一份每日檔案，並以 conversationId／turnId
 * 對應到當時的模型往返，因此除錯時可直接看到「被評為差的那次，
 * 模型收到什麼、回了什麼」。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: {
    conversationId?: string;
    turnId?: string;
    rating?: string;
    comment?: string;
    answerText?: string;
    path?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  if (body.rating !== "up" && body.rating !== "down") {
    return NextResponse.json(
      { error: "rating 必須為 up 或 down" },
      { status: 400 },
    );
  }

  await logFeedback({
    conversationId: body.conversationId,
    turnId: body.turnId,
    userId: user.id,
    userName: user.name,
    rating: body.rating,
    comment: body.comment,
    answerText: body.answerText,
    path: body.path,
  });

  return NextResponse.json({ ok: true });
}
