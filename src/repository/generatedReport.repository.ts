import { prisma } from "./client";
import type {
  PeriodReportStatus,
  PeriodReportType,
} from "@/generated/prisma/enums";

export type CreateGeneratedReportData = {
  projectId: string;
  type: PeriodReportType;
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  title: string;
  markdown: string;
  sources?: string | null;
  aiAuthored: boolean;
  generatedById?: string | null;
  generatedBy?: string | null;
};

export function create(data: CreateGeneratedReportData) {
  return prisma.generatedReport.create({ data });
}

export function findById(id: string) {
  return prisma.generatedReport.findUnique({ where: { id } });
}

/** 某專案的報表留存，新到舊。 */
export function listByProject(projectId: string, take = 50) {
  return prisma.generatedReport.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** 同一專案、同週期、同期間是否已有定稿（同期只允許一份 CONFIRMED）。 */
export function findConfirmedForPeriod(
  projectId: string,
  type: PeriodReportType,
  periodStart: Date,
) {
  return prisma.generatedReport.findFirst({
    where: { projectId, type, periodStart, status: "CONFIRMED" },
  });
}

export function confirm(
  id: string,
  by: { confirmedById?: string | null; confirmedBy?: string | null },
) {
  return prisma.generatedReport.update({
    where: { id },
    data: { status: "CONFIRMED", confirmedAt: new Date(), ...by },
  });
}

/**
 * 刪除一份報表留存。
 *
 * 呼叫端須先確認其非 CONFIRMED —— 已確認者是當時送審依據的留存，
 * 不可刪除亦不可修改（見 schema 註解）。
 */
export function remove(id: string) {
  return prisma.generatedReport.delete({ where: { id } });
}

export type GeneratedReportRow = Awaited<ReturnType<typeof findById>>;

export function listStatuses(): PeriodReportStatus[] {
  return ["DRAFT", "CONFIRMED"];
}
