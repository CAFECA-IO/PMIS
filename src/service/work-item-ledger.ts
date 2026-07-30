import {
  wbsCategoryLabel,
  type ValuationStatus,
  type WbsCategoryId,
} from "@/constant/ledger";

/**
 * 工項數量與估驗台帳的計算（純函式，無 I/O，便於單元測試）。
 *
 * 台帳上只有四個量是資料，其餘全部推導：
 *   契約數量 × 單價 = 契約複價
 *   累計完成 ÷ 契約數量 = 完成率
 *   完成／查驗／估驗三個量的關係 = 估驗狀態
 *
 * 推導而不儲存是刻意的。這三個值若各存一份，任何一次漏更新都會產生
 * 「金額與數量對不起來」的紀錄，而對帳時無從判斷哪一個才是真的。
 */

/** 台帳一列的原始數量（皆可為未填）。 */
export type LedgerQty = {
  /** 契約數量。 */
  contractQty: number | null;
  /** 單價。 */
  unitPrice: number | null;
  /** 累計完成量。 */
  completedQty: number | null;
  /** 查驗合格量。 */
  inspectedQty: number | null;
  /** 累計估驗量。 */
  valuatedQty: number | null;
};

export type LedgerRowInput = LedgerQty & {
  id: string;
  code: string | null;
  name: string;
  unit: string | null;
  wbsCode: string | null;
  /** WBS 類別 id；未分類者以 other 呈現。 */
  wbsCategory: string | null;
};

/** 一列台帳的完整呈現值。 */
export type LedgerRow = LedgerRowInput & {
  categoryLabel: string;
  /** 契約複價＝契約數量 × 單價。任一未填則為 null。 */
  contractAmount: number | null;
  /** 完成金額＝累計完成 × 單價。 */
  completedAmount: number | null;
  /** 估驗金額＝累計估驗 × 單價。 */
  valuatedAmount: number | null;
  /** 完成率（百分比，一位小數）。契約數量未填或為 0 時為 null。 */
  completionRate: number | null;
  /** 估驗率（百分比，一位小數）。 */
  valuationRate: number | null;
  status: ValuationStatus;
  /** 數量互相矛盾的具體說明；正常時為空陣列。 */
  anomalies: string[];
};

const n = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : v;

/** 兩數相乘；任一未填即無法計算，回 null 而非 0。 */
export function multiply(a: number | null, b: number | null): number | null {
  const x = n(a);
  const y = n(b);
  return x === null || y === null ? null : round(x * y, 2);
}

/** 四捨五入到指定小數位，避免浮點誤差累積成 0.30000000000000004。 */
export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * 百分比。
 *
 * 分母為 0 時回 null 而非 0 或 100 ——
 * 「契約數量 0」代表資料還沒填，不代表完成率是 0%。
 */
export function percent(part: number | null, whole: number | null): number | null {
  const p = n(part);
  const w = n(whole);
  if (p === null || w === null || w === 0) return null;
  return round((p / w) * 100, 1);
}

/**
 * 由數量推出估驗狀態。
 *
 * 判定順序即實務上的推進順序：施作 → 查驗 → 估驗。
 * 異常優先於一切，因為「估驗量多於查驗量」代表估驗了沒驗過的東西，
 * 那是要立刻查明的事，不該被歸類成「部分估驗」而混在正常件裡。
 */
export function valuationStatus(qty: LedgerQty): ValuationStatus {
  const done = n(qty.completedQty) ?? 0;
  const inspected = n(qty.inspectedQty) ?? 0;
  const valuated = n(qty.valuatedQty) ?? 0;
  const contract = n(qty.contractQty);

  if (
    inspected > done ||
    valuated > inspected ||
    (contract !== null && done > contract)
  ) {
    return "ANOMALY";
  }
  if (done === 0) return "NOT_STARTED";
  if (inspected === 0) return "PENDING_INSPECTION";
  if (valuated < inspected) return "PARTIAL";
  return "SETTLED";
}

/**
 * 數量互相矛盾之處。
 *
 * 逐項寫明而不只給一個「異常」標記：對帳時要能直接看出是哪一組數字不對，
 * 否則使用者得自己把四個數字兩兩相比。
 */
export function anomaliesOf(qty: LedgerQty): string[] {
  const out: string[] = [];
  const done = n(qty.completedQty) ?? 0;
  const inspected = n(qty.inspectedQty) ?? 0;
  const valuated = n(qty.valuatedQty) ?? 0;
  const contract = n(qty.contractQty);

  if (inspected > done) {
    out.push(`查驗合格量 ${inspected} 大於累計完成量 ${done}`);
  }
  if (valuated > inspected) {
    out.push(`累計估驗量 ${valuated} 大於查驗合格量 ${inspected}`);
  }
  if (contract !== null && done > contract) {
    out.push(`累計完成量 ${done} 超出契約數量 ${contract}`);
  }
  return out;
}

/** 組出一列台帳的呈現值。 */
export function ledgerRow(input: LedgerRowInput): LedgerRow {
  return {
    ...input,
    categoryLabel: wbsCategoryLabel(input.wbsCategory ?? "other"),
    contractAmount: multiply(input.contractQty, input.unitPrice),
    completedAmount: multiply(input.completedQty, input.unitPrice),
    valuatedAmount: multiply(input.valuatedQty, input.unitPrice),
    completionRate: percent(input.completedQty, input.contractQty),
    valuationRate: percent(input.valuatedQty, input.contractQty),
    status: valuationStatus(input),
    anomalies: anomaliesOf(input),
  };
}

export function ledgerRows(inputs: LedgerRowInput[]): LedgerRow[] {
  return inputs.map(ledgerRow);
}

// ── 彙總 ────────────────────────────────────────────────────

export type LedgerTotals = {
  /** 契約複價合計。 */
  contractAmount: number;
  completedAmount: number;
  valuatedAmount: number;
  /** 以金額加權的完成率（百分比）。 */
  completionRate: number | null;
  valuationRate: number | null;
  rows: number;
  /** 數量異常的列數。 */
  anomalies: number;
};

/**
 * 合計。
 *
 * 完成率以「金額加權」而非各列百分比的平均 ——
 * 一件 1.8 億的主幹管與一件 3 千萬的職安費若各算一票，
 * 平均出來的百分比與實際請款進度毫無關係。
 */
export function ledgerTotals(rows: LedgerRow[]): LedgerTotals {
  const sum = (pick: (r: LedgerRow) => number | null) =>
    round(rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0), 2);

  const contractAmount = sum((r) => r.contractAmount);
  const completedAmount = sum((r) => r.completedAmount);
  const valuatedAmount = sum((r) => r.valuatedAmount);

  return {
    contractAmount,
    completedAmount,
    valuatedAmount,
    completionRate: percent(completedAmount, contractAmount),
    valuationRate: percent(valuatedAmount, contractAmount),
    rows: rows.length,
    anomalies: rows.filter((r) => r.anomalies.length > 0).length,
  };
}

export type WbsGroup = LedgerTotals & {
  category: WbsCategoryId | string;
  label: string;
};

/**
 * 依 WBS 類別彙整。
 *
 * 類別順序沿用常數的宣告順序（土建 → 管線 → 機械 → 電氣 → 職安 → 間接費），
 * 那是估驗台帳的慣用排列；改成依金額排序會讓每期報表的列序都不一樣。
 */
export function groupByWbs(
  rows: LedgerRow[],
  order: readonly { id: string; label: string }[],
): WbsGroup[] {
  const grouped = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const key = r.wbsCategory ?? "other";
    const list = grouped.get(key);
    if (list) list.push(r);
    else grouped.set(key, [r]);
  }

  const out: WbsGroup[] = [];
  for (const c of order) {
    const list = grouped.get(c.id);
    if (!list) continue;
    out.push({ category: c.id, label: c.label, ...ledgerTotals(list) });
    grouped.delete(c.id);
  }
  // 不在既定順序內的類別（資料異常或日後新增）補在最後，不可默默丟掉
  for (const [key, list] of grouped) {
    out.push({ category: key, label: wbsCategoryLabel(key), ...ledgerTotals(list) });
  }
  return out;
}

/** 只取數量互相矛盾的列（差異異常檢視）。 */
export function anomalyRows(rows: LedgerRow[]): LedgerRow[] {
  return rows.filter((r) => r.anomalies.length > 0);
}

// ── 與既有進度欄位的銜接 ────────────────────────────────────

/**
 * 由數量推得的進度百分比（整數）。
 *
 * WorkItem.progress 是既有的 S 曲線與上捲計算來源。有了數量之後，
 * 進度應以數量比例為準並在存檔時同步寫回 progress，
 * 讓下游只有一個真實來源 —— 否則會出現「台帳說 37%、S 曲線說 60%」。
 * 數量不齊時回 null，代表沿用人工填的百分比。
 */
export function progressFromQty(qty: LedgerQty): number | null {
  const rate = percent(qty.completedQty, qty.contractQty);
  if (rate === null) return null;
  return Math.min(100, Math.max(0, Math.round(rate)));
}

/** 是否具備計量條件（有契約數量與單位才談得上台帳）。 */
export function isMeasured(qty: { contractQty: number | null; unit: string | null }): boolean {
  return n(qty.contractQty) !== null && Boolean(qty.unit?.trim());
}
