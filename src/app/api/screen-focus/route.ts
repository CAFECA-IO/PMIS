import { NextResponse } from "next/server";

import * as screenFocus from "@/service/screenFocus.service";
import * as aiService from "@/service/ai.service";
import { getCurrentUser } from "@/service/auth.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  try {
    const route = new URL(request.url).searchParams.get("route") ?? "/";
    const focus = await screenFocus.getScreenFocus(route, {
      id: user.id,
      role: user.role,
    });
    const text = await aiService.summarizeScreenFocus(focus.label, focus.facts);
    return NextResponse.json({ label: focus.label, facts: focus.facts, text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "畫面重點載入失敗。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
