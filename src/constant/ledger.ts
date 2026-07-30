/**
 * 工項數量與估驗台帳的詞彙（PMIS-04／PMIS-08 交界）。
 *
 * 台帳是「契約數量 × 單價」與「實際做了多少、驗了多少、估驗了多少」的對照表，
 * 也是監造與承商對帳的依據。欄位定義集中在此，避免各處自行造詞。
 */

/** 計量單位。取自公共工程常用單位，非自由字串以便彙總與檢核。 */
export const WORK_UNITS = [
  "m",
  "m2",
  "m3",
  "t",
  "kg",
  "組",
  "台",
  "座",
  "支",
  "處",
  "式",
  "月",
  "日",
  "人月",
  "車次",
] as const;

export type WorkUnit = (typeof WORK_UNITS)[number];

export function isWorkUnit(value: string): value is WorkUnit {
  return (WORK_UNITS as readonly string[]).includes(value);
}

/**
 * WBS 類別。
 *
 * 對應估驗台帳上的分類彙整，也是承商計價與監造查驗的分工邊界。
 * 間接費（品管、工地管理、保險）獨立一類，因為它不隨施作數量變動，
 * 混進土建工程會讓「土建進度」失真。
 */
export const WBS_CATEGORIES = [
  { id: "civil", label: "土建工程" },
  { id: "pipeline", label: "管線工程" },
  { id: "mechanical", label: "機械工程" },
  { id: "electrical", label: "電氣儀控" },
  { id: "safety", label: "職安環保" },
  { id: "indirect", label: "間接費" },
  { id: "other", label: "其他" },
] as const;

export type WbsCategoryId = (typeof WBS_CATEGORIES)[number]["id"];

export const wbsCategoryLabel = (id: string): string =>
  WBS_CATEGORIES.find((c) => c.id === id)?.label ?? "其他";

export const wbsCategoryOptions = WBS_CATEGORIES.map((c) => ({
  value: c.id,
  label: c.label,
}));

/**
 * 估驗狀態。由數量推得，不另存欄位 ——
 * 存下來就會有「狀態說已完成、數字說沒有」的矛盾，而使用者無從判斷哪個為真。
 */
export type ValuationStatus =
  | "NOT_STARTED"
  | "PENDING_INSPECTION"
  | "PARTIAL"
  | "SETTLED"
  | "ANOMALY";

export const valuationStatusMeta: Record<
  ValuationStatus,
  { label: string; variant: "muted" | "warning" | "secondary" | "success" | "destructive"; hint: string }
> = {
  NOT_STARTED: {
    label: "未施作",
    variant: "muted",
    hint: "尚無完成量",
  },
  PENDING_INSPECTION: {
    label: "待查驗",
    variant: "warning",
    hint: "已完成但尚未查驗合格",
  },
  PARTIAL: {
    label: "部分估驗",
    variant: "secondary",
    hint: "查驗合格量多於已估驗量，尚有可估驗的部分",
  },
  SETTLED: {
    label: "正常",
    variant: "success",
    hint: "完成、查驗與估驗數量一致",
  },
  ANOMALY: {
    label: "數量異常",
    variant: "destructive",
    hint: "數量之間互相矛盾，需查明",
  },
};
