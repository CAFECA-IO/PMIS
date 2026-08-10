import { getCurrentUser } from "@/service/auth.service";
import { logFeedback } from "@/service/faithLog.service";
import { jsonOk, jsonFail } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

export const runtime = "nodejs";

/**
 * Info: (20260728 - Luphia) 使用者對某則費思回答的評價。
 *
 * 與互動紀錄寫入同一個資料夾、同一份每日檔案，並以 conversationId／turnId
 * 對應到當時的模型往返，因此除錯時可直接看到「被評為差的那次，
 * 模型收到什麼、回了什麼」。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);

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
    return jsonFail(API_ERRORS.VA_BAD_JSON);
  }

  if (body.rating !== "up" && body.rating !== "down") {
    return jsonFail(API_ERRORS.VA_BAD_RATING);
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

  return jsonOk(null, "已記錄評價");
}
