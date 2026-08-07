import * as reportRepo from "@/repository/supervisionReport.repository";
import {
  QTY_COUNTED_REPORT_STATUSES,
  QTY_PENDING_REPORT_STATUSES,
} from "@/constant/pmis";
import { dailyQtyTotals } from "@/service/work-item-effective";

/**
 * 日報數量的取數層（決策 A／G）。
 *
 * 存在的理由是把「哪些狀態的日報算數」收在一處：
 * repository 只負責取數（不持有業務規則、亦不引用 constant，
 * 與該層既有慣例一致）；`work-item-effective` 只做純計算（無 I/O）；
 * 本檔負責把兩者接起來並套用 `QTY_COUNTED_REPORT_STATUSES`。
 *
 * 因此**呼叫端請一律用本檔**，不要直接呼叫 repository 的
 * `sumDailyQtyByWorkItem` —— 否則狀態規則會在各處各寫一份，
 * 規則變更時必然漏改。
 */

/**
 * 專案各工項的日報累計數量（全期間）。
 *
 * 回傳 `workItemId → 總量`；查無紀錄的工項不會出現在 Map 中
 * （呼叫端以「無日報紀錄」處理，其有效累計量即等於期初值）。
 */
export async function loadDailyQtyTotals(
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await reportRepo.sumDailyQtyByWorkItem(
    projectId,
    QTY_COUNTED_REPORT_STATUSES,
  );
  return dailyQtyTotals(rows);
}

/**
 * 專案各工項在指定期間內的日報數量增量。
 *
 * 供月報「本期完成」欄位使用 —— 該欄先前因無期末快照而顯示 `—`，
 * 有了逐日數量後即為「期間內該工項 dailyQty 之和」，不需另建快照表。
 */
export async function loadDailyQtyTotalsInPeriod(
  projectId: string,
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const rows = await reportRepo.sumDailyQtyByWorkItem(
    projectId,
    QTY_COUNTED_REPORT_STATUSES,
    { start, end },
  );
  return dailyQtyTotals(rows);
}

/**
 * 專案各工項在「尚未計入」狀態的日報中已填、但還不算進累計的數量（決策 G）。
 *
 * 用於畫面提示，不進入任何累計運算。缺了這個提示，監造填完草稿後看台帳
 * 沒動，會以為數字被系統吃掉而重複填報 —— 這是決策 G 的必要配套。
 */
export async function loadPendingDailyQtyTotals(
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await reportRepo.sumDailyQtyByWorkItem(
    projectId,
    QTY_PENDING_REPORT_STATUSES,
  );
  return dailyQtyTotals(rows);
}

/**
 * 跨專案的日報累計數量（決策 F 的下游需要）。
 *
 * `projectIds` 為 null 時涵蓋全部未刪除專案（儀表板用），
 * 給定陣列則限於該批專案（專案列表用）。
 */
export async function loadDailyQtyTotalsForProjects(
  projectIds: string[] | null,
): Promise<Map<string, number>> {
  const rows = await reportRepo.sumDailyQtyByWorkItemForProjects(
    projectIds,
    QTY_COUNTED_REPORT_STATUSES,
  );
  return dailyQtyTotals(rows);
}
