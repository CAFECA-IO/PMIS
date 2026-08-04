/**
 * Info: (20260803 - Julian)
 * AI 彙整報告自訂圖表 DSL 的常數（fence 語言、設定鍵、錯誤碼、格式）。
 * 自 iSunFA constants/custom_chart.ts 移植；改為 PMIS 慣用的 `as const` + 字面聯集。
 * 圖種列舉值即等於 markdown fence 語言（```custom-matrix …），避免另做字串對照。
 */

/** 自訂圖表的 fence 語言標籤（即圖種判別字串）。 */
export const CUSTOM_CHART_TYPE = {
  MATRIX: "custom-matrix",
  TORNADO: "custom-tornado",
  HISTOGRAM: "custom-histogram",
  BOXPLOT: "custom-boxplot",
  // Info: (20260803 - Julian) 進度 S-Curve（預定/實際/預測），取代 mermaid xychart（其 lexer 不支援中文標籤）
  SCURVE: "custom-scurve",
  // Info: (20260803 - Julian) 累計進度橫條，末端標示本期增量
  PROGRESS: "custom-progress",
} as const;

export type CustomChartType =
  (typeof CUSTOM_CHART_TYPE)[keyof typeof CUSTOM_CHART_TYPE];

/** 全部合法的 fence 語言集合，供 detectCustomChartType 快速比對。 */
export const CUSTOM_CHART_TYPES: readonly CustomChartType[] =
  Object.values(CUSTOM_CHART_TYPE);

/** DSL 設定列允許的鍵（key: value）。 */
export const CUSTOM_CHART_CONFIG_KEY = {
  TITLE: "title",
  X_AXIS: "xaxis",
  Y_AXIS: "yaxis",
  X_SCALE: "xscale",
  Y_SCALE: "yscale",
  UNIT: "unit",
  TREND: "trend",
  // Info: (20260803 - Julian) 矩陣圖四象限底色（Q1..Q4，逗號分隔 HEX）
  QUADRANT_COLORS: "quadrantcolors",
  // Info: (20260803 - Julian) 龍捲風圖左/右數列顏色 HEX
  LEFT_COLOR: "leftcolor",
  RIGHT_COLOR: "rightcolor",
  // Info: (20260803 - Julian) 龍捲風圖型別（compare / sensitivity）與基準值
  MODE: "mode",
  BASELINE: "baseline",
  // Info: (20260803 - Julian) 直方圖趨勢線顏色 HEX（未設定採預設色）
  TREND_COLOR: "trendcolor",
} as const;

export type CustomChartConfigKey =
  (typeof CUSTOM_CHART_CONFIG_KEY)[keyof typeof CUSTOM_CHART_CONFIG_KEY];

/** 解析失敗的錯誤碼（供 render fallback 與除錯使用）。 */
export const CUSTOM_CHART_PARSE_ERROR_CODE = {
  UNKNOWN_TYPE: "UNKNOWN_TYPE",
  EMPTY_CONTENT: "EMPTY_CONTENT",
  NO_DATA_ROWS: "NO_DATA_ROWS",
  MALFORMED_ROW: "MALFORMED_ROW",
  INVALID_NUMBER: "INVALID_NUMBER",
  SCHEMA_VALIDATION_FAILED: "SCHEMA_VALIDATION_FAILED",
} as const;

export type CustomChartParseErrorCode =
  (typeof CUSTOM_CHART_PARSE_ERROR_CODE)[keyof typeof CUSTOM_CHART_PARSE_ERROR_CODE];

/** 群組顏色的 HEX 格式驗證（#RGB / #RRGGBB / #RRGGBBAA）。 */
export const HEX_COLOR_REGEX =
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** DSL 註解前綴（沿用 mermaid 慣例）。 */
export const CUSTOM_CHART_COMMENT_PREFIX = "%%";

/** 龍捲風圖標題列序列化形式（`左數列 <-> 右數列`）。 */
export const CUSTOM_CHART_TORNADO_HEADER_SEPARATOR = "<->";

/** 矩陣圖雙極軸序列化形式（`min 端 ↔ max 端`）；沿用全形箭號。 */
export const CUSTOM_CHART_AXIS_SEPARATOR = "↔";

/** 成對欄位（軸/數列標頭）可用的分隔符。 */
export const CUSTOM_CHART_PAIR_SEPARATORS: readonly string[] = [
  CUSTOM_CHART_TORNADO_HEADER_SEPARATOR,
  CUSTOM_CHART_AXIS_SEPARATOR,
];
