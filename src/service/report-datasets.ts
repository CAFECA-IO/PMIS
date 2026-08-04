/**
 * Info: (20260803 - Julian)
 * AI 彙整報告的「白名單數據集」：程式決定論算好、具名、附來源；LLM 只能挑 id 與圖種，不打數字。
 * 本檔為純函式（不碰 DB），資料由呼叫端（report.service）餵入，便於單元測試。
 */
import { niceNum } from "@/components/chart-primitives";
import { CUSTOM_CHART_TYPE, type CustomChartType } from "@/constant/custom-chart";
import { defectSeverityMeta } from "@/constant/pmis";
import type { DefectSeverity } from "@/generated/prisma/enums";

/** 一組數據集可被畫成的圖種（mermaid 圓餅或四種自訂圖）。 */
export type ChartKind = "pie" | CustomChartType;

export type DatasetData =
  | { shape: "categorical"; entries: Array<{ label: string; value: number }> }
  | {
      shape: "paired";
      unit?: string;
      leftName: string;
      rightName: string;
      rows: Array<{ category: string; left: number; right: number }>;
    }
  | {
      shape: "points";
      xAxis: { min?: string; max?: string; scale?: number };
      yAxis: { min?: string; max?: string; scale?: number };
      points: Array<{ label: string; x: number; y: number; group?: string }>;
    }
  | {
      shape: "bins";
      xLabel?: string;
      yLabel?: string;
      trend?: "normal";
      bins: Array<{ label: string; count: number }>;
    }
  | {
      shape: "boxes";
      yLabel?: string;
      unit?: string;
      boxes: Array<{
        label: string;
        min: number;
        q1: number;
        median: number;
        q3: number;
        max: number;
        outliers?: number[];
      }>;
    };

export interface ReportDataset {
  /** 穩定代號，供 LLM 於 pmis-chart 指令引用。 */
  id: string;
  title: string;
  /** 一句話說明；供 prompt 目錄與治理來源引用。 */
  summary: string;
  /** 資料來源描述（治理：強制附來源）。 */
  source: string;
  allowedCharts: ChartKind[];
  data: DatasetData;
}

// ── 統計助手（決定論）────────────────────────────────────────────
const SEVERITY_ORDINAL: Record<DefectSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const DAY_MS = 86_400_000;

/** 兩日期相差天數（無條件捨去，最小 0）。 */
export function diffDays(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

/** 線性內插分位數（type 7，與 numpy 預設一致）。values 需非空。 */
export function quantile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 1) return sortedAsc[0];
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (pos - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

/** 由一組數值算五數綜合 + Tukey 1.5×IQR 離群點（鬚線只到界內極值）。 */
export function fiveNumberSummary(values: number[]): {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
} {
  const s = [...values].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const median = quantile(s, 0.5);
  const q3 = quantile(s, 0.75);
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const inFence = s.filter((v) => v >= loFence && v <= hiFence);
  const outliers = s.filter((v) => v < loFence || v > hiFence);
  return {
    min: inFence.length ? inFence[0] : s[0],
    q1,
    median,
    q3,
    max: inFence.length ? inFence[inFence.length - 1] : s[s.length - 1],
    outliers,
  };
}

/** 決定論等寬分箱：以 niceNum 選漂亮組距，回傳 {label,count}。values 需非空。 */
export function binValues(values: number[], targetBins = 5): Array<{ label: string; count: number }> {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ label: `${fmt(min)}`, count: values.length }];
  }
  const width = niceNum((max - min) / targetBins, true) || 1;
  const start = Math.floor(min / width) * width;
  const bins: Array<{ label: string; count: number }> = [];
  for (let lo = start; lo <= max; lo += width) {
    const hi = lo + width;
    const isLast = hi > max;
    const count = values.filter(
      (v) => v >= lo && (isLast ? v <= hi : v < hi),
    ).length;
    bins.push({ label: `${fmt(lo)}–${fmt(hi)}`, count });
  }
  return bins;
}

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

// ── 數據集組裝輸入 ───────────────────────────────────────────────
export interface ReportDatasetInput {
  workItemStatus: Array<{ label: string; value: number }>;
  inspectionResult: Array<{ label: string; value: number }>;
  periodCompare: {
    prevLabel: string;
    curLabel: string;
    rows: Array<{ category: string; prev: number; cur: number }>;
  };
  openDefects: Array<{
    title: string;
    severity: DefectSeverity;
    dueDate: Date | null;
  }>;
  now: Date;
  resolutionDays: number[];
  reviewDaysByCategory: Array<{ category: string; days: number[] }>;
}

const truncate = (s: string, n = 10): string =>
  s.length > n ? `${s.slice(0, n)}…` : s;

/**
 * 由已備妥的原始資料組出白名單數據集。純函式、決定論；資料不足的數據集自動略過（不硬湊）。
 */
export function assembleDatasets(input: ReportDatasetInput): ReportDataset[] {
  const out: ReportDataset[] = [];

  // 1. 工程分項狀態（圓餅）
  const wi = input.workItemStatus.filter((e) => e.value > 0);
  if (wi.length > 0) {
    out.push({
      id: "work_item_status",
      title: "工程分項狀態",
      summary: "各工程分項目前狀態的件數分布",
      source: "工程分項（WorkItem.status）",
      allowedCharts: ["pie"],
      data: { shape: "categorical", entries: wi },
    });
  }

  // 2. 本期查驗結果（圓餅）
  const ins = input.inspectionResult.filter((e) => e.value > 0);
  if (ins.length > 0) {
    out.push({
      id: "inspection_result",
      title: "本期查驗結果",
      summary: "本期查驗結果（合格/不合格等）的件數分布",
      source: "查驗紀錄（Inspection.result）",
      allowedCharts: ["pie"],
      data: { shape: "categorical", entries: ins },
    });
  }

  // 3. 本期 vs 上期 件數（龍捲風 compare）
  const cmpRows = input.periodCompare.rows.filter(
    (r) => r.prev > 0 || r.cur > 0,
  );
  if (cmpRows.length > 0) {
    out.push({
      id: "defects_period_compare",
      title: "本期 vs 上期 事項件數",
      summary: "缺失/查驗/送審/環安衛在本期與上期的件數對比",
      source: "缺失/查驗/送審/環安衛紀錄的期間計數",
      allowedCharts: [CUSTOM_CHART_TYPE.TORNADO],
      data: {
        shape: "paired",
        unit: "件",
        leftName: input.periodCompare.prevLabel,
        rightName: input.periodCompare.curLabel,
        rows: cmpRows.map((r) => ({
          category: r.category,
          left: r.prev,
          right: r.cur,
        })),
      },
    });
  }

  // 4. 未結案缺失 嚴重度 × 逾期天數（矩陣）
  const points = input.openDefects
    .filter((d) => d.dueDate != null)
    .map((d) => ({
      label: truncate(d.title),
      x: diffDays(d.dueDate as Date, input.now),
      y: SEVERITY_ORDINAL[d.severity],
      group: defectSeverityMeta[d.severity].label,
    }));
  if (points.length > 0) {
    out.push({
      id: "open_defect_matrix",
      title: "未結案缺失 嚴重度 × 逾期天數",
      summary: "未結案缺失依嚴重度與逾期天數定位，供處理優先排序",
      source: "未結案缺失（Defect.severity / dueDate）",
      allowedCharts: [CUSTOM_CHART_TYPE.MATRIX],
      data: {
        shape: "points",
        xAxis: { min: "未逾期", max: "逾期越久" },
        yAxis: { min: "輕微", max: "嚴重", scale: 4 },
        points,
      },
    });
  }

  // 5. 缺失改善耗時分布（直方）
  if (input.resolutionDays.length > 0) {
    out.push({
      id: "defect_resolution_histogram",
      title: "缺失改善耗時分布",
      summary: "本期已結案缺失的改善耗時（天）分布",
      source: "已結案缺失（Defect.resolvedAt − createdAt）",
      allowedCharts: [CUSTOM_CHART_TYPE.HISTOGRAM],
      data: {
        shape: "bins",
        xLabel: "改善耗時（天）",
        yLabel: "件數",
        trend: "normal",
        bins: binValues(input.resolutionDays),
      },
    });
  }

  // 6. 送審審查天數 by 類別（箱型）
  const boxes = input.reviewDaysByCategory
    .filter((g) => g.days.length > 0)
    .map((g) => {
      const s = fiveNumberSummary(g.days);
      return {
        label: g.category,
        min: s.min,
        q1: s.q1,
        median: s.median,
        q3: s.q3,
        max: s.max,
        ...(s.outliers.length > 0 ? { outliers: s.outliers } : {}),
      };
    });
  if (boxes.length > 0) {
    out.push({
      id: "submittal_review_boxplot",
      title: "送審審查天數 by 類別",
      summary: "各送審類別的審查天數五數綜合，比較審查穩定度",
      source: "送審紀錄（Submittal.reviewDate − actualSubmitDate，依類別分組）",
      allowedCharts: [CUSTOM_CHART_TYPE.BOXPLOT],
      data: { shape: "boxes", yLabel: "天數", unit: "天", boxes },
    });
  }

  return out;
}
