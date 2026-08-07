import { prisma } from "./client";
import type {
  ReportStatus,
  WorkStopReason,
} from "@/generated/prisma/enums";

export type SupervisionReportData = {
  reportDate: Date;
  weather?: string | null;
  summary?: string | null;
  manpower?: string | null;
  equipment?: string | null;
  keyNotes?: string | null;
  filedBy?: string | null;
  /** 停工原因；null 代表當日有施工（決策 H）。 */
  stopReason?: WorkStopReason | null;
  /** 是否免計工期（E5）。 */
  excludedFromDuration?: boolean;
  /** 免計工期的契約依據。 */
  exclusionBasis?: string | null;
  status: ReportStatus;
};

export function listByProject(projectId: string) {
  return prisma.supervisionReport.findMany({
    where: { projectId },
    orderBy: { reportDate: "desc" },
  });
}

export function listByProjectInPeriod(projectId: string, start: Date, end: Date) {
  return prisma.supervisionReport.findMany({
    where: { projectId, reportDate: { gte: start, lte: end } },
    orderBy: { reportDate: "asc" },
  });
}

export function findById(id: string) {
  return prisma.supervisionReport.findUnique({ where: { id } });
}

export function findByProjectDate(projectId: string, reportDate: Date) {
  return prisma.supervisionReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate } },
  });
}

export function create(projectId: string, data: SupervisionReportData) {
  return prisma.supervisionReport.create({ data: { projectId, ...data } });
}

export function update(
  id: string,
  data: Partial<Omit<SupervisionReportData, "reportDate">>,
) {
  return prisma.supervisionReport.update({ where: { id }, data });
}

export function remove(id: string) {
  return prisma.supervisionReport.delete({ where: { id } });
}

// ── 日報數量表（E1）─────────────────────────────────────────

/** 依工項加總的一列結果；`total` 為 null 代表分組無可加總的數值。 */
export type DailyQtySumRow = {
  workItemId: string | null;
  total: number | null;
};

/**
 * 日報數量依工程分項加總。
 *
 * `statuses` 由呼叫端指定而非在此寫死：哪些狀態的日報算數是業務規則
 * （見 `constant/pmis` 的 `QTY_COUNTED_REPORT_STATUSES`），
 * 本層不持有規則，以維持 repository 只負責取數的分工。
 * 實務上請透過 `service/daily-qty.service` 呼叫，該處統一套用規則。
 *
 * 省略 `period` 則為全期間累計；給定則為該期間內的增量
 * （供月報「本期完成」欄位）。
 *
 * `workItemId` 為 null 的列（契約外臨時項目）在此即排除 ——
 * 它們不屬於任何台帳工項，計入任何工項的加總都是錯的。
 */
export async function sumDailyQtyByWorkItem(
  projectId: string,
  statuses: readonly ReportStatus[],
  period?: { start: Date; end: Date },
): Promise<DailyQtySumRow[]> {
  const groups = await prisma.supervisionReportItem.groupBy({
    by: ["workItemId"],
    where: {
      workItemId: { not: null },
      report: {
        projectId,
        status: { in: [...statuses] },
        ...(period
          ? { reportDate: { gte: period.start, lte: period.end } }
          : {}),
      },
    },
    _sum: { dailyQty: true },
  });

  return groups.map((g) => ({
    workItemId: g.workItemId,
    // Decimal → number；null 代表該分組無數值，交由呼叫端視同無資料
    total: g._sum.dailyQty === null ? null : Number(g._sum.dailyQty),
  }));
}

/** 某日報的數量表明細（依表單排序）。 */
export function listItems(reportId: string) {
  return prisma.supervisionReportItem.findMany({
    where: { reportId },
    orderBy: [{ sortOrder: "asc" }, { itemName: "asc" }],
  });
}

export type SupervisionReportItemData = {
  workItemId: string | null;
  itemName: string;
  unit: string | null;
  dailyQty: number;
  note: string | null;
  sortOrder: number;
};

/**
 * 以整批取代某日報的數量表。
 *
 * 採「全刪後重建」而非逐列比對：表單一次送出整張表，而前端新增／刪除列後
 * 未必有穩定的列識別可對應，逐列 diff 徒增複雜度而無實益。
 * 兩個動作在單一交易內完成，不會出現「刪了但沒建回」的中間狀態。
 */
export function replaceItems(
  reportId: string,
  items: SupervisionReportItemData[],
) {
  return prisma.$transaction([
    prisma.supervisionReportItem.deleteMany({ where: { reportId } }),
    ...(items.length > 0
      ? [
          prisma.supervisionReportItem.createMany({
            data: items.map((i) => ({ reportId, ...i })),
          }),
        ]
      : []),
  ]);
}

/**
 * 跨專案的日報數量加總（供專案列表與儀表板等跨案指標）。
 *
 * `projectIds` 為 null 時涵蓋全部未刪除專案；空陣列直接回空結果，
 * 不發出無意義的查詢。`workItemId` 全域唯一，故回傳的 Map 不需再分專案。
 */
export async function sumDailyQtyByWorkItemForProjects(
  projectIds: string[] | null,
  statuses: readonly ReportStatus[],
): Promise<DailyQtySumRow[]> {
  if (projectIds !== null && projectIds.length === 0) return [];

  const groups = await prisma.supervisionReportItem.groupBy({
    by: ["workItemId"],
    where: {
      workItemId: { not: null },
      report: {
        status: { in: [...statuses] },
        ...(projectIds !== null
          ? { projectId: { in: projectIds } }
          : { project: { deletedAt: null } }),
      },
    },
    _sum: { dailyQty: true },
  });

  return groups.map((g) => ({
    workItemId: g.workItemId,
    total: g._sum.dailyQty === null ? null : Number(g._sum.dailyQty),
  }));
}

/**
 * 某工程分項已被幾筆日報數量列引用（決策 L）。
 *
 * 不分報表狀態一律計入：草稿雖不計入累計，其單位快照仍已寫下，
 * 事後改動工項單位同樣會造成新舊列量綱不一致。
 */
export function countItemsByWorkItem(workItemId: string): Promise<number> {
  return prisma.supervisionReportItem.count({ where: { workItemId } });
}
