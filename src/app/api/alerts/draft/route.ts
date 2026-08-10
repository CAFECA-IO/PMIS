import * as faith from "@/service/faith.service";
import { getCurrentUser } from "@/service/auth.service";
import { toFaithError } from "@/service/faith-error";
import { jsonOk, jsonFail, jsonError } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);

  try {
    const body = (await request.json()) as { instruction?: string };
    const instruction = body.instruction?.trim();
    if (!instruction) {
      return jsonFail(API_ERRORS.VA_MISSING_INSTRUCTION);
    }
    const result = await faith.draftAlertRule(instruction);
    return jsonOk(result);
  } catch (error) {
    // Info: (20260810 - Luphia) 沿用 toFaithError 整理過的可讀訊息，語意碼統一為 IN000001
    return jsonError(error, toFaithError(error).message);
  }
}
