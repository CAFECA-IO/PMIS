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
  detail?: string | null;
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
 */
export function listByProject(projectId: string, take = 200) {
  return prisma.supervisionReportAuditLog.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
