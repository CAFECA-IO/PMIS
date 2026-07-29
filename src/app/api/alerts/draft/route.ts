import { NextResponse } from "next/server";

import * as faith from "@/service/faith.service";
import { getCurrentUser } from "@/service/auth.service";
import { toFaithError } from "@/service/faith-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  try {
    const body = (await request.json()) as { instruction?: string };
    const instruction = body.instruction?.trim();
    if (!instruction) {
      return NextResponse.json({ error: "請描述您想要的預警規則。" }, { status: 400 });
    }
    const result = await faith.draftAlertRule(instruction);
    return NextResponse.json(result);
  } catch (error) {
    const message = toFaithError(error).message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
