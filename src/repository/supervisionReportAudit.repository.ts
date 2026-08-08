import { prisma } from "./client";
import type { ReportStatus } from "@/generated/prisma/enums";

export type AuditAction = "CREATE" | "UPDATE" | "STATUS" | "ITEMS" | "DELETE";

export type CreateAuditData = {
  reportId: string;
  projectId: string;
  /** 該日報的報表日期；刪除後 reportId 已無對應，靠本欄辨識是哪一天。 */
  reportDate?: Date | null;
  itemId?: string | null;
  action: AuditAction;
  actorId?: string | null;
  actorName?: string | null;
  fromStatus?: ReportStatus | null;
  toStatus?: ReportStatus | null;
  /** 供人閱讀的摘要（可能含換行）。 */
  detail?: string | null;
  /** 變更前／建立時的完整內容 JSON；與 detail 分欄，見 schema 註解。 */
  snapshot?: string | null;
};

export function create(data: CreateAuditData) {
  return prisma.supervisionReportAuditLog.create({ data });
}

/** 一次寫入多筆（同一次儲存可能同時有欄位異動與數量表異動）。 */
export function createMany(rows: CreateAuditData[]) {
  if (rows.length === 0) return Promise.resolve({ count: 0 });
  return prisma.supervisionReportAuditLog.createMany({ data: rows });
}

/** 某份日報的軌跡，新到舊。 */
export function listByReport(reportId: string) {
  return prisma.supervisionReportAuditLog.findMany({
    where: { reportId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * 某專案的軌跡（含已刪除日報的紀錄）。
 *
 * 已刪除日報的軌跡只能由此讀到 —— `listByReport` 需要 reportId，
 * 而日報一旦刪除，使用者已無從得知那個 id。
 *
 * `take` 由呼叫端指定，本層不設預設值：「一次看幾筆」是呈現決策，
 * 不是取數規則（見 `supervisionReport.service` 的 `PROJECT_AUDIT_PAGE_SIZE`）。
 *
 * 多取一筆用來判斷還有沒有更多。畫面若把截斷後的清單當成全部，
 * 稽核時看到一份「看起來很完整」卻少了那筆刪除紀錄的清單，
 * 比明說「僅顯示最近 N 筆」危險得多。
 */
export async function listByProject(
  projectId: string,
  take: number,
  before?: Date,
): Promise<{ rows: AuditRow[]; hasMore: boolean }> {
  const rows = await prisma.supervisionReportAuditLog.findMany({
    where: { projectId, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: take + 1,
  });
  return { rows: rows.slice(0, take), hasMore: rows.length > take };
}

type AuditRow = Awaited<
  ReturnType<typeof prisma.supervisionReportAuditLog.findMany>
>[number];
