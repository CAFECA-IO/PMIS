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

/** 逐日日誌用於工作日判定的最小欄位。 */
export interface DailyLogLike {
  reportDate: Date;
  weather: string | null;
  summary: string | null;
}

/** 單日分類。 */
export type WorkDayKind = "WORKING" | "RAIN_STOP" | "HOLIDAY";

export interface WorkDayStats {
  working: number;
  rainStop: number;
  holiday: number;
  total: number;
}

// Info: (20260804 - Julian) 判定用關鍵詞抽為常數，避免散落魔法字串；
// 此規則影響工期展延爭議，實務上需由監造確認後再調整。
const RAIN_WEATHER_KEYWORDS = ["雨", "颱", "豪雨"] as const;
const STOP_KEYWORDS = ["停工", "暫停", "未施工"] as const;
const HOLIDAY_KEYWORDS = ["例假", "假日", "休息"] as const;

const includesAny = (text: string, words: readonly string[]): boolean =>
  words.some((w) => text.includes(w));

/**
 * 單日分類規則（決定論）：
 * 1. 敘述含例假／假日 → 例假日
 * 2. 天氣含雨／颱 且 敘述含停工／暫停／未施工 → 雨天停工
 * 3. 敘述為空 → 例假日（無填報視為未排工）
 * 4. 其餘 → 施工日
 */
export function classifyWorkDay(log: DailyLogLike): WorkDayKind {
  const summary = (log.summary ?? "").trim();
  const weather = (log.weather ?? "").trim();

  if (summary && includesAny(summary, HOLIDAY_KEYWORDS)) return "HOLIDAY";
  if (
    includesAny(weather, RAIN_WEATHER_KEYWORDS) &&
    includesAny(summary, STOP_KEYWORDS)
  ) {
    return "RAIN_STOP";
  }
  if (!summary) return "HOLIDAY";
  return "WORKING";
}

/** 彙總工作日組成。 */
export function summarizeWorkDays(logs: DailyLogLike[]): WorkDayStats {
  const stats: WorkDayStats = {
    working: 0,
    rainStop: 0,
    holiday: 0,
    total: logs.length,
  };
  for (const log of logs) {
    const kind = classifyWorkDay(log);
    if (kind === "WORKING") stats.working += 1;
    else if (kind === "RAIN_STOP") stats.rainStop += 1;
    else stats.holiday += 1;
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
