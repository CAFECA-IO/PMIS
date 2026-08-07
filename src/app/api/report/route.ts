import { NextResponse } from "next/server";

import * as reportService from "@/service/report.service";
import type { ReportType } from "@/service/report.service";
import { getCurrentUser } from "@/service/auth.service";
import { currentUserCanEdit } from "@/service/access.service";
import { toFaithError } from "@/service/faith-error";

export const runtime = "nodejs";

const VALID: ReportType[] = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      projectId?: string;
      type?: string;
      refDate?: string;
    };
    if (!body.projectId) {
      return NextResponse.json({ error: "缺少專案" }, { status: 400 });
    }
    const type: ReportType = VALID.includes(body.type as ReportType)
      ? (body.type as ReportType)
      : "MONTHLY";

    /*
      產出即留存（決策 J-a）：回傳的 markdown 與寫進 GeneratedReport 的
      是同一個字串，故「畫面上這一版」與「留存的那一版」不可能不同。
      僅有編輯權限者會留存 —— 純瀏覽不應在留存清單留下紀錄。
    */
    const view = await reportService.generateReportView(
      body.projectId,
      type,
      body.refDate,
      { id: user.id, name: user.name, role: user.role },
      await currentUserCanEdit("/logs"),
    );
    if (!view) {
      return NextResponse.json({ error: "無法存取此專案或專案不存在" }, { status: 403 });
    }
    return NextResponse.json({
      ...view.report,
      savedId: view.savedId,
      confirmedId: view.confirmedId,
    });
  } catch (error) {
    const message = toFaithError(error).message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
