// 行事曆與預警：規則類型與選項的顯示名稱。
// 型別以字串聯集定義（與 prisma schema 的 enum 成員一致），
// 使純邏輯與 UI 不必相依 Prisma 產生的型別。

import type { BadgeMeta as Meta } from "@/constant/badge";

export type AlertRuleKind = "FIXED_DATE" | "RELATIVE_DATE" | "CONDITION";
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AlertAnchor =
  | "CONTRACT_END"
  | "OBLIGATION_DUE"
  | "DOCUMENT_DUE"
  | "INSPECTION_DATE"
  | "DEFECT_DUE";
export type AlertMetric =
  | "SCHEDULE_LAG"
  | "INSPECTION_FAILED"
  | "DEFECT_OVERDUE"
  | "SUBMITTAL_PENDING"
  | "DEVICE_OFFLINE_MINUTES"
  | "BUDGET_USAGE";
export type AlertOperator = "GTE" | "LTE" | "GT" | "LT" | "EQ";

export const alertRuleKindMeta: Record<AlertRuleKind, Meta> = {
  FIXED_DATE: { label: "固定日期", variant: "secondary" },
  RELATIVE_DATE: { label: "相對日期", variant: "outline" },
  CONDITION: { label: "條件觸發", variant: "warning" },
};

export const alertRuleKindHint: Record<AlertRuleKind, string> = {
  FIXED_DATE: "於指定日期當日起觸發，適用於法定期限、契約到期等固定時點。",
  RELATIVE_DATE: "以某個基準日為準提前 N 天觸發，適用於文件、查驗、改善期限的預告。",
  CONDITION: "以指標與門檻判斷，適用於進度落後、查驗不合格、設備離線等狀況。",
};

export const alertSeverityMeta: Record<AlertSeverity, Meta> = {
  INFO: { label: "提示", variant: "muted" },
  WARNING: { label: "警告", variant: "warning" },
  CRITICAL: { label: "嚴重", variant: "destructive" },
};

export const alertAnchorMeta: Record<AlertAnchor, Meta> = {
  CONTRACT_END: { label: "履約完工日", variant: "outline" },
  OBLIGATION_DUE: { label: "履約事項期限", variant: "outline" },
  DOCUMENT_DUE: { label: "文件／送審期限", variant: "secondary" },
  INSPECTION_DATE: { label: "查驗預定日", variant: "warning" },
  DEFECT_DUE: { label: "缺失改善期限", variant: "warning" },
};

/** 條件度量：label 為顯示名稱，unit 為預設單位，module 為綁定的功能模組。 */
export const alertMetricMeta: Record<
  AlertMetric,
  { label: string; unit: string; module: string }
> = {
  SCHEDULE_LAG: { label: "進度落後", unit: "%", module: "/schedule" },
  INSPECTION_FAILED: { label: "查驗不合格件數", unit: "件", module: "/quality" },
  DEFECT_OVERDUE: { label: "逾期未改善缺失", unit: "件", module: "/quality" },
  SUBMITTAL_PENDING: { label: "待審送審件數", unit: "件", module: "/submittals" },
  DEVICE_OFFLINE_MINUTES: {
    label: "設備離線時間",
    unit: "分鐘",
    module: "/monitoring",
  },
  BUDGET_USAGE: { label: "預算使用率", unit: "%", module: "/finance" },
};

export const alertOperatorMeta: Record<AlertOperator, { label: string; symbol: string }> = {
  GTE: { label: "大於等於", symbol: "≥" },
  LTE: { label: "小於等於", symbol: "≤" },
  GT: { label: "大於", symbol: ">" },
  LT: { label: "小於", symbol: "<" },
  EQ: { label: "等於", symbol: "=" },
};

/** 規則可綁定的功能模組（與側邊欄路由一致）。 */
export const alertModuleMeta: Record<string, string> = {
  "/schedule": "時程進度",
  "/projects": "工程專案",
  "/submittals": "簽核管理",
  "/documents": "檔案管理",
  "/quality": "品質稽核",
  "/ehs": "環安衛管理",
  "/monitoring": "智能監測",
  "/finance": "財務管理",
  "/calendar": "行事曆與預警",
  "/obligations": "履約事項",
};

export const alertRuleKindOptions = (
  Object.keys(alertRuleKindMeta) as AlertRuleKind[]
).map((value) => ({ value, label: alertRuleKindMeta[value].label }));

export const alertSeverityOptions = (
  Object.keys(alertSeverityMeta) as AlertSeverity[]
).map((value) => ({ value, label: alertSeverityMeta[value].label }));

export const alertAnchorOptions = (
  Object.keys(alertAnchorMeta) as AlertAnchor[]
).map((value) => ({ value, label: alertAnchorMeta[value].label }));

export const alertMetricOptions = (
  Object.keys(alertMetricMeta) as AlertMetric[]
).map((value) => ({ value, label: alertMetricMeta[value].label }));

export const alertOperatorOptions = (
  Object.keys(alertOperatorMeta) as AlertOperator[]
).map((value) => ({ value, label: alertOperatorMeta[value].symbol }));
