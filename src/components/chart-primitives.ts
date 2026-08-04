/**
 * Info: (20260803 - Julian)
 * 四張自訂圖表（矩陣 / 龍捲風 / 直方 / 箱型）共用的計算工具、灰階配色與型別。
 * 純函式、無相依，供 SSR SVG 元件使用。
 */

// ─────────────────────────────────────────────────────────────
// 灰階配色（D2）：一律用 PMIS CSS 變數，僅 accent 為單一品牌強調色
// ─────────────────────────────────────────────────────────────
export const CHART_COLOR = {
  /** 主要圖形（長條、盒身、資料點） */
  foreground: "var(--foreground)",
  /** 次要／對比數列、軸線、離群點、次要文字 */
  muted: "var(--muted-foreground)",
  /** 格線 */
  grid: "var(--border)",
  /** 象限／區塊底色 */
  block: "var(--muted)",
  /** 中位數線 / 描邊（與深色圖形對比） */
  contrast: "var(--background)",
  /** 單一品牌強調色（趨勢線、基準線等，全圖至多一處） */
  accent: "var(--primary)",
} as const;

/**
 * 多類別的灰階濃淡階梯：以 foreground 搭配遞減不透明度區分群組，
 * 取代 isunfa 的彩色 DEFAULT_COLORS 色盤。
 */
export const GRAY_RAMP_OPACITY = [1, 0.7, 0.48, 0.32, 0.2, 0.12] as const;

export function grayShade(index: number): { fill: string; opacity: number } {
  return {
    fill: CHART_COLOR.foreground,
    opacity: GRAY_RAMP_OPACITY[index % GRAY_RAMP_OPACITY.length],
  };
}

// ─────────────────────────────────────────────────────────────
// 計算工具
// ─────────────────────────────────────────────────────────────

/** 夾住數值於 [lo, hi]。 */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 千分位格式化，最多三位小數。 */
export function formatValue(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

/** 1 / 2 / 5 × 10ⁿ 的「漂亮」刻度間距。range<=0 時回傳 1。 */
export function niceNum(range: number, round: boolean): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let nice: number;
  if (round) {
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3) nice = 2;
    else if (fraction < 7) nice = 5;
    else nice = 10;
  } else {
    if (fraction <= 1) nice = 1;
    else if (fraction <= 2) nice = 2;
    else if (fraction <= 5) nice = 5;
    else nice = 10;
  }
  return nice * Math.pow(10, exponent);
}

/** 產生線性比例尺函式，將 [d0,d1] 映射到 [r0,r1]。 */
export function scaleLinear(
  d0: number,
  d1: number,
  r0: number,
  r1: number,
): (v: number) => number {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

// ─────────────────────────────────────────────────────────────
// 型別（AST）：自 iSunFA 移植，移除 CustomChartType 判別欄
// ─────────────────────────────────────────────────────────────

export type TornadoMode = "compare" | "sensitivity";
export type HistogramTrendType = "normal";

/** 矩陣圖單軸設定。 */
export interface MatrixAxis {
  /** min 端文字標籤 */
  min?: string;
  /** max 端文字標籤 */
  max?: string;
  /** 軸範圍上限（選填，未給則自資料推算） */
  scale?: number;
}

export interface MatrixPoint {
  label: string;
  x: number;
  y: number;
  /** 群組（用於灰階濃淡區分） */
  group?: string;
}

/** 矩陣圖（四象限散佈）資料。 */
export interface MatrixChartData {
  title?: string;
  xAxis: MatrixAxis;
  yAxis: MatrixAxis;
  points: MatrixPoint[];
  /** 呼叫端自訂群組色（覆寫灰階預設） */
  groupColors?: Record<string, string>;
  /** 四象限底色 Q1..Q4 = 右上/左上/左下/右下（覆寫灰階預設） */
  quadrantColors?: string[];
}

export interface TornadoBar {
  category: string;
  left: number;
  right: number;
}

/** 龍捲風圖（雙數列蝴蝶圖 / 敏感度圖）資料。 */
export interface TornadoChartData {
  title?: string;
  unit?: string;
  /** 未設定 = "compare" */
  mode?: TornadoMode;
  /** sensitivity 模式的中心基準值 */
  baseline?: number;
  leftSeries?: string;
  rightSeries?: string;
  /** 呼叫端自訂數列色（覆寫灰階預設） */
  leftColor?: string;
  rightColor?: string;
  bars: TornadoBar[];
}

export interface HistogramBin {
  label: string;
  count: number;
}

/** 直方圖（已分箱，含選填常態趨勢線）資料。 */
export interface HistogramChartData {
  title?: string;
  xAxis?: string;
  yAxis?: string;
  /** 選填常態分布趨勢線 */
  trend?: HistogramTrendType;
  /** 呼叫端自訂趨勢線色（覆寫強調色預設） */
  trendColor?: string;
  bins: HistogramBin[];
}

/** S-Curve 單一時間點；預定為必填，實際與預測可缺（尚未發生）。 */
export interface ScurvePoint {
  label: string;
  planned: number;
  actual?: number;
  forecast?: number;
}

/** 進度 S-Curve（預定／實際／預測累計曲線）資料。 */
export interface ScurveChartData {
  title?: string;
  xAxis?: string;
  yAxis?: string;
  unit?: string;
  points: ScurvePoint[];
}

/** 進度橫條單列：長度為累計值，末端標示本期增量。 */
export interface ProgressItem {
  label: string;
  /** 累計完成值（長條總長） */
  cumulative: number;
  /** 本期增量（自累計中切出，以深色標示） */
  current?: number;
  /** 預定值；有值時畫目標標記線 */
  planned?: number;
}

/** 累計進度橫條圖資料。 */
export interface ProgressChartData {
  title?: string;
  unit?: string;
  /** 座標上限；未給則取資料最大值（或 100，視 unit 而定） */
  scale?: number;
  items: ProgressItem[];
}

export interface BoxItem {
  label: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers?: number[];
}

/** 箱型圖（五數綜合盒鬚圖）資料。 */
export interface BoxplotChartData {
  title?: string;
  yAxis?: string;
  unit?: string;
  boxes: BoxItem[];
}
