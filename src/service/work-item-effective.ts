import { progressFromQty, type LedgerQty } from "@/service/work-item-ledger";

/**
 * 工項的「有效」數量與進度（純函式，無 I/O，便於單元測試）。
 *
 * 背景：決策 A（2026-08-05）確立監造日報為單一真實來源後，
 * `WorkItem.completedQty` 的語意由「當前累計完成量」改為「期初累計基準」，
 * 當前累計改由日報數量表加總推導：
 *
 *     有效累計完成量 = 期初(WorkItem.completedQty) + Σ 日報 dailyQty
 *     有效進度       = progressFromQty(有效累計量, 契約數量) ?? 人工填報進度
 *
 * 為何推導而不回寫欄位（決策 F）：
 * 回寫等於同時存在「欄位值」與「日報加總」兩份資料，而累計量會因日報填報
 * 隨時改變 —— 只要有一個寫入路徑忘了重算，就會出現「日報已更新、
 * S 曲線仍是舊值」而兩邊都自稱正確。不存推導值則此類 bug 無從發生。
 * 這也與 `WorkItem` schema 既有明訓一致：契約複價與完成率一律推導、不另存欄位。
 *
 * 為何 `progress` 仍須保留為欄位（決策 F）：
 * 未計量工項（無 `contractQty`／`unit`，例如自表單或費思助手新增而尚未
 * 登錄數量者）沒有可推導的來源，人工填報值是其唯一進度。若改為純推導，
 * 這些工項的進度會從 S 曲線與履約事項上捲上消失。
 */

/**
 * workItemId → 該工項的日報本日完成量總和。
 *
 * 不含契約外臨時項目（`workItemId` 為 null 的日報列）。
 */
export type DailyQtyTotals = ReadonlyMap<string, number>;

/** 日報加總查詢的原始結果一列（`_sum` 可能為 null）。 */
export type DailyQtyGroup = {
  workItemId: string | null;
  total: number | null;
};

/**
 * 把日報數量的分組加總整理成可查詢的 Map。
 *
 * 刻意丟棄兩種列：
 *  - `workItemId` 為 null：契約外臨時項目，不屬於任何台帳工項，
 *    計入任何工項的累計都是錯的。
 *  - `total` 為 null：分組存在但無可加總的數值，視同無資料。
 *
 * 同一 `workItemId` 若重複出現（理論上不應發生），後者累加而非覆蓋，
 * 以免靜默丟棄數量。
 */
export function dailyQtyTotals(groups: DailyQtyGroup[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of groups) {
    if (!g.workItemId) continue;
    if (g.total === null || !Number.isFinite(g.total)) continue;
    out.set(g.workItemId, (out.get(g.workItemId) ?? 0) + g.total);
  }
  return out;
}

/**
 * 從加總中扣掉「正在編輯的那一份日報」自己已計入的量。
 *
 * 編輯一份**已計入**（已提送／已核備）的日報時，它的數量本來就已經在
 * 加總裡；若直接把加總當成畫面上的「目前累計」，
 * 「填報後累計 = 目前累計 + 本日填報」就會把同一筆量算兩次，
 * 「超出契約數量」的提示也會跟著誤報。
 *
 * 只扣加總中已存在的工項：`own` 有而加總沒有，代表該份日報尚未計入
 * （草稿），此時本來就不該扣。扣到負值夾為 0 —— 理論上不會發生
 * （自身量必為加總的一部分），真發生時顯示負累計只會更難理解。
 *
 * 不就地修改傳入的 Map。
 */
export function excludeOwnDailyQty(
  totals: DailyQtyTotals,
  own: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map(totals);
  for (const [workItemId, qty] of own) {
    if (!Number.isFinite(qty)) continue;
    const base = out.get(workItemId);
    if (base === undefined) continue;
    out.set(workItemId, Math.max(0, base - qty));
  }
  return out;
}

/**
 * 有效累計完成量 = 期初 + 日報加總。
 *
 * 兩者皆未填時回 `null`（代表「無資料」），而非 0 ——
 * 下游據此區分「尚未填報」與「填報為 0」：
 * `progressFromQty` 對 null 回 null 而落回人工填報進度，對 0 則算出 0%。
 * 若在此把 null 當 0，未計量工項的人工進度會被 0% 覆蓋。
 */
export function effectiveCompletedQty(
  opening: number | null,
  dailyTotal: number | null,
): number | null {
  const hasOpening = opening !== null && Number.isFinite(opening);
  const hasDaily = dailyTotal !== null && Number.isFinite(dailyTotal);
  if (!hasOpening && !hasDaily) return null;
  return (hasOpening ? opening : 0) + (hasDaily ? dailyTotal : 0);
}

/** 把 0-100 之外的值夾回範圍內，並取整。 */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * 有效進度（0-100 整數）。
 *
 * 已計量工項（有契約數量）以數量比例為準；
 * 未計量工項沿用人工填報值（`storedProgress`）。
 *
 * 傳入的 `qty.completedQty` 應**已是有效累計量**（期初 + 日報加總），
 * 而非資料庫原值 —— 呼叫端請先經 `withEffectiveQty`。
 */
export function effectiveProgress(
  qty: LedgerQty,
  storedProgress: number,
): number {
  const derived = progressFromQty(qty);
  return derived === null ? clampPercent(storedProgress) : derived;
}

/**
 * 以有效累計量取代原始 `completedQty`，回傳新物件。
 *
 * 供台帳與報表的取數處使用：既有的推導純函式
 * （`ledgerRow`／`valuationStatus`／`anomaliesOf`／`progressFromQty`）
 * 全部以參數接收數量，因此只要在此換掉輸入值，
 * 金額、完成率、估驗狀態、異常判定皆無須改動即自動改以日報為準。
 *
 * 不就地修改傳入物件（避免呼叫端共用參照時互相污染）。
 */
export function withEffectiveQty<T extends LedgerQty>(
  row: T,
  dailyTotal: number | null,
): T {
  return {
    ...row,
    completedQty: effectiveCompletedQty(row.completedQty, dailyTotal),
  };
}

/**
 * 一次處理多列：以 workItemId 查表取得日報加總並換算。
 *
 * 找不到對應加總者以 null 傳入（等同「日報尚無此工項的紀錄」），
 * 其有效累計量即等於期初值。
 */
export function withEffectiveQtyAll<T extends LedgerQty & { id: string }>(
  rows: T[],
  totals: DailyQtyTotals,
): T[] {
  return rows.map((row) => withEffectiveQty(row, totals.get(row.id) ?? null));
}

// ── 有效進度的套用（決策 F）────────────────────────────────

/**
 * 套用有效進度所需的最小欄位。
 *
 * 數量欄位以 `unknown` 接收並於內部轉 number：資料庫回傳的是 Prisma Decimal，
 * 沿用專案既有的「Decimal 於邊界轉 number」慣例，讓呼叫端不必各自轉換。
 */
export type EffectiveProgressRow = {
  id: string;
  progress: number;
  contractQty: unknown;
  completedQty: unknown;
};

const asNum = (v: unknown): number | null =>
  v == null ? null : Number(v as number);

/**
 * 以有效進度取代 `progress` 欄位值，回傳新物件。
 *
 * 有效進度 = 由「期初＋日報加總」對契約數量的比例推導；
 * 未計量工項（無契約數量）沿用原欄位的人工填報值（決策 F）。
 *
 * 供上捲、S 曲線等下游使用：這些純函式都以 `progress` 欄位為輸入，
 * 因此只要在取數處換掉這個值，下游邏輯無須改動即改以日報為準
 * —— 與 `withEffectiveQty` 同一個模式。
 */
export function withEffectiveProgress<T extends EffectiveProgressRow>(
  row: T,
  dailyTotal: number | null,
): T {
  const contractQty = asNum(row.contractQty);
  const completedQty = effectiveCompletedQty(
    asNum(row.completedQty),
    dailyTotal,
  );
  return {
    ...row,
    progress: effectiveProgress(
      {
        contractQty,
        completedQty,
        // 估驗狀態與此無關，不取這三個量
        unitPrice: null,
        inspectedQty: null,
        valuatedQty: null,
      },
      row.progress,
    ),
  };
}

/** 一次處理多列；查無日報加總者以 null 傳入（其有效累計即等於期初）。 */
export function withEffectiveProgressAll<T extends EffectiveProgressRow>(
  rows: T[],
  totals: DailyQtyTotals,
): T[] {
  return rows.map((row) =>
    withEffectiveProgress(row, totals.get(row.id) ?? null),
  );
}
