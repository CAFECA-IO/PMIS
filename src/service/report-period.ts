/**
 * Info: (20260804 - Julian)
 * 監造報表的週期用詞、工期計算與工作日統計。
 * 全為純函式、決定論，不碰 DB，便於單元測試；供 report-template 組裝骨架使用。
 */
import type { ReportType } from "@/service/report.service";

/**
 * 週期用詞。範本文案以此替換，避免季報／年報仍寫死「本月」。
 * Info: (20260804 - Julian) 四種週期共用同一份範本結構，僅用詞不同。
 */
export const PERIOD_LABEL: Record<ReportType, string> = {
  DAILY: "本日",
  WEEKLY: "本週",
  MONTHLY: "本月",
  QUARTERLY: "本季",
  ANNUAL: "本年",
};

/** 報表名稱（沿用既有用語，供標題與 prompt）。 */
export const PERIOD_REPORT_NAME: Record<ReportType, string> = {
  DAILY: "日報",
  WEEKLY: "週報",
  MONTHLY: "月報",
  QUARTERLY: "季報",
  ANNUAL: "年報",
};

const DAY_MS = 86_400_000;

/** 工期概況；契約工期未填時 total/remaining 為 null，呼叫端應顯示「—」。 */
export interface DurationSummary {
  /** 契約工期（工作天）；未填為 null */
  total: number | null;
  /** 累積工期（自開工日至期末的日曆天數）；無開工日為 null */
  elapsed: number | null;
  /** 剩餘工期 = total − elapsed；任一為 null 時為 null */
  remaining: number | null;
  /** 使用比例（%，四捨五入至小數 1 位）；無法計算時為 null */
  usedPercent: number | null;
}

/**
 * 計算工期概況。
 * Info: (20260804 - Julian) 累積工期採「開工日 → 期末」的日曆天數；契約工期為工作天，
 * 兩者單位不同義，故此處不做換算，僅並列呈現，比例僅供參考。
 */
export function summarizeDuration(
  startDate: Date | null,
  periodEnd: Date,
  contractWorkDays: number | null,
): DurationSummary {
  const elapsed =
    startDate == null
      ? null
      : Math.max(
          0,
          Math.floor((periodEnd.getTime() - startDate.getTime()) / DAY_MS),
        );
  const total =
    contractWorkDays != null && Number.isFinite(contractWorkDays)
      ? contractWorkDays
      : null;
  const remaining =
    total != null && elapsed != null ? Math.max(0, total - elapsed) : null;
  const usedPercent =
    total != null && total > 0 && elapsed != null
      ? Math.round((elapsed / total) * 1000) / 10
      : null;
  return { total, elapsed, remaining, usedPercent };
}

/**
 * 停工原因（決策 H）。
 *
 * 刻意在此以字面聯集重述，而非 import `@/generated/prisma/enums` ——
 * 本檔為純函式模組（無 I/O、無 DB 相依），保持可獨立測試。
 * 型別相容性由呼叫端保證：Prisma 產生的同名列舉指派進來時，
 * 若 schema 日後增列而此處未同步，tsc 會在邊界報錯，不會靜默漂移。
 */
export type StopReason =
  | "WEATHER"
  | "EARTHQUAKE"
  | "HOLIDAY"
  | "NO_SCHEDULE"
  | "OTHER";

/** 逐日日誌用於工作日判定的最小欄位。 */
export interface DailyLogLike {
  reportDate: Date;
  /** 僅供紀錄，**不參與**工作日判定（決策 D）。 */
  weather: string | null;
  summary: string | null;
  /** 停工原因；null 代表當日有施工。決策 H 後為判定的權威來源。 */
  stopReason?: StopReason | null;
  /** 是否免計工期（E5）；具法律效果，由監造宣告，系統不推測。 */
  excludedFromDuration?: boolean;
}

/** 單日分類。 */
export type WorkDayKind =
  | "WORKING"
  /** 天候停工（雨、颱風）。 */
  | "WEATHER_STOP"
  /** 地震停工。與天候分列，因兩者在工期展延與結構複檢上的處置不同。 */
  | "EARTHQUAKE_STOP"
  | "HOLIDAY"
  | "NO_SCHEDULE"
  | "OTHER_STOP"
  /** 已填報但既無停工原因亦無敘述，不足以判定。 */
  | "UNCLASSIFIED";

export interface WorkDayStats {
  working: number;
  weatherStop: number;
  earthquakeStop: number;
  holiday: number;
  noSchedule: number;
  otherStop: number;
  unclassified: number;
  /**
   * 免計工期天數（E5）。
   *
   * 與停工天數**刻意分開計算**：停工不必然免計工期
   * （例假日在日曆天契約下仍計工期），免計與否是監造依契約條款的宣告。
   * 此數在結算與工期展延爭議中有金額意義，故單獨列出。
   */
  excludedDays: number;
  /** 期間內的日報篇數（非曆日數）。 */
  total: number;
}

// Info: (20260804 - Julian) 判定用關鍵詞抽為常數，避免散落魔法字串；
// 此規則影響工期展延爭議，實務上需由監造確認後再調整。
const STOP_KEYWORDS = ["停工", "暫停", "未施工"] as const;
const HOLIDAY_KEYWORDS = ["例假", "假日", "休息"] as const;

const includesAny = (text: string, words: readonly string[]): boolean =>
  words.some((w) => text.includes(w));

const BY_STOP_REASON: Record<StopReason, WorkDayKind> = {
  WEATHER: "WEATHER_STOP",
  EARTHQUAKE: "EARTHQUAKE_STOP",
  HOLIDAY: "HOLIDAY",
  NO_SCHEDULE: "NO_SCHEDULE",
  OTHER: "OTHER_STOP",
};

/**
 * 單日分類規則（決定論）。
 *
 * 1. `stopReason` 有值 → 依該列舉（決策 H，權威來源）
 * 2. （相容舊資料）敘述含例假／假日／休息 → 例假日
 * 3. （相容舊資料）敘述含停工／暫停／未施工 → 其他停工
 * 4. 敘述非空 → 施工日
 * 5. 敘述為空 → 未分類
 *
 * **天氣欄位不參與判定**（決策 D）：天氣紀錄為「雨」不代表停工，停工與否
 * 由填報者以 `stopReason` 明示；此前以「天氣含雨且敘述含停工」推測的規則已移除。
 * 註：`WEATHER` 是使用者**明示**的停工原因，與天氣紀錄欄位是兩回事。
 *
 * 規則 5 亦為修正：先前把「敘述為空」判為例假日，使漏填被計成假日，
 * 膨脹例假日並壓低施工天數。無從判定時不臆測，另列未分類。
 */
export function classifyWorkDay(log: DailyLogLike): WorkDayKind {
  if (log.stopReason) return BY_STOP_REASON[log.stopReason];

  const summary = (log.summary ?? "").trim();
  if (!summary) return "UNCLASSIFIED";
  if (includesAny(summary, HOLIDAY_KEYWORDS)) return "HOLIDAY";
  if (includesAny(summary, STOP_KEYWORDS)) return "OTHER_STOP";
  return "WORKING";
}

/** 彙總工作日組成。 */
export function summarizeWorkDays(logs: DailyLogLike[]): WorkDayStats {
  const stats: WorkDayStats = {
    working: 0,
    weatherStop: 0,
    earthquakeStop: 0,
    holiday: 0,
    noSchedule: 0,
    otherStop: 0,
    unclassified: 0,
    excludedDays: 0,
    total: logs.length,
  };
  const bucket: Record<
    WorkDayKind,
    keyof Omit<WorkDayStats, "total" | "excludedDays">
  > = {
    WORKING: "working",
    WEATHER_STOP: "weatherStop",
    EARTHQUAKE_STOP: "earthquakeStop",
    HOLIDAY: "holiday",
    NO_SCHEDULE: "noSchedule",
    OTHER_STOP: "otherStop",
    UNCLASSIFIED: "unclassified",
  };
  for (const log of logs) {
    stats[bucket[classifyWorkDay(log)]] += 1;
    // 免計工期獨立累計，與分類正交（施工日亦可能免計，如部分停工）
    if (log.excludedFromDuration) stats.excludedDays += 1;
  }
  return stats;
}

/** 進度增量計算所需的履約事項最小欄位。 */
export interface WeightedMilestone {
  weight: number;
  dueDate: Date | null;
  actualDate: Date | null;
}

/**
 * 本期進度增量（百分點）。
 *
 * Info: (20260804 - Julian)
 * 以「期間內到期／實際完成的權重占全案總權重」計算，與 S-Curve 的累計定義一致。
 * 刻意不從月度 S-Curve 相減取得——那只能支援月報；本法對週／月／季／年皆成立，
 * 且不需任何期末快照。無權重資料時回 null，呼叫端顯示「—」。
 */
export function periodProgressDelta(
  items: WeightedMilestone[],
  start: Date,
  end: Date,
): { planned: number | null; actual: number | null } {
  const total = items.reduce((s, m) => s + m.weight, 0);
  if (total <= 0) return { planned: null, actual: null };

  const inRange = (d: Date | null): boolean =>
    d != null && d.getTime() >= start.getTime() && d.getTime() <= end.getTime();

  const sum = (pick: (m: WeightedMilestone) => Date | null): number =>
    items.reduce((s, m) => (inRange(pick(m)) ? s + m.weight : s), 0);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    planned: round2((sum((m) => m.dueDate) / total) * 100),
    actual: round2((sum((m) => m.actualDate) / total) * 100),
  };
}

/**
 * 截取 S-Curve 顯示區間：保留「期末所在點」及其之前共 count 個點。
 * 期末之後的點（未來預定）予以保留最多 1 個，以呈現趨勢延伸。
 */
export function trimCurveWindow<T extends { label: string }>(
  points: T[],
  endLabel: string,
  count = 6,
): T[] {
  if (points.length === 0) return [];
  const idx = points.findIndex((p) => p.label === endLabel);
  const anchor = idx === -1 ? points.length - 1 : idx;
  const from = Math.max(0, anchor - count + 1);
  const to = Math.min(points.length, anchor + 2);
  return points.slice(from, to);
}

/** 月度分桶標籤（與 buildSCurve 一致的 `YYYY/MM` 格式）。 */
export function monthLabel(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 落差描述：正為超前、負為落後、0 為符合預定。回傳如「超前 9.99 個百分點」。 */
export function describeGap(gap: number): string {
  const rounded = Math.round(gap * 100) / 100;
  if (rounded === 0) return "與預定相符";
  const abs = Math.abs(rounded);
  return `${rounded > 0 ? "超前" : "落後"} ${abs} 個百分點`;
}
