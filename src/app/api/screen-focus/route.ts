import * as screenFocus from "@/service/screenFocus.service";
import * as faith from "@/service/faith.service";
import { getCurrentUser } from "@/service/auth.service";
import { toFaithError } from "@/service/faith-error";
import { jsonOk, jsonFail, jsonError } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);
  }

  try {
    const route = new URL(request.url).searchParams.get("route") ?? "/";
    const focus = await screenFocus.getScreenFocus(route, {
      id: user.id,
      role: user.role,
    });
    const text = await faith.summarizeScreenFocus(focus.label, focus.facts);
    return jsonOk({ label: focus.label, facts: focus.facts, text });
  } catch (error) {
    // Info: (20260810 - Luphia) 沿用 toFaithError 整理過的可讀訊息，語意碼統一為 IN000001
    return jsonError(error, toFaithError(error).message);
  }
}
