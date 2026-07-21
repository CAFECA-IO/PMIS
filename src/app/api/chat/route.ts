import { NextResponse } from "next/server";

import * as aiService from "@/service/ai.service";
import type { ChatMessage, ChatAttachment } from "@/service/ai.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      attachment?: ChatAttachment;
    };
    const text = await aiService.chat(body.messages ?? [], body.attachment);
    return NextResponse.json({ text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI 服務發生未預期錯誤。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
