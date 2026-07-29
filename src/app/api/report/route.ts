import { NextResponse } from "next/server";

import * as reportService from "@/service/report.service";
import type { ReportType } from "@/service/report.service";
import { getCurrentUser } from "@/service/auth.service";
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

    const report = await reportService.generateReport(
      body.projectId,
      type,
      body.refDate,
      { id: user.id, name: user.name, role: user.role },
    );
    if (!report) {
      return NextResponse.json({ error: "無法存取此專案或專案不存在" }, { status: 403 });
    }
    return NextResponse.json(report);
  } catch (error) {
    const message = toFaithError(error).message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
