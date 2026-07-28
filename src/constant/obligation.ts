// 履約事項：階段／風險／觸發方式／狀態的顯示名稱。
// 型別以字串聯集定義（與 prisma schema 的 enum 成員一致），
// 讓純邏輯與 UI 不必相依 Prisma 產生的型別。

import type { BadgeMeta as Meta } from "@/constant/badge";

export type ObligationStage =
  | "CONCEPT_DESIGN"
  | "DETAIL_DESIGN"
  | "TENDER"
  | "CONSTRUCTION"
  | "COMMISSIONING"
  | "HANDOVER"
  | "OTHER";

export type ObligationRisk = "GREEN" | "YELLOW" | "ORANGE" | "RED" | "PURPLE";

export type ObligationTrigger =
  | "FIXED_DATE"
  | "RELATIVE_DUE"
  | "PREDECESSOR"
  | "CONDITION";

export type ObligationStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PENDING_REVIEW"
  | "PENDING_EXTERNAL"
  | "OVERDUE"
  | "DONE";

/** 階段只是分類，不帶好壞判斷 → 一律中性，避免整張表都是彩色色塊。 */
export const obligationStageMeta: Record<ObligationStage, Meta> = {
  CONCEPT_DESIGN: { label: "概念設計", variant: "outline" },
  DETAIL_DESIGN: { label: "細部設計", variant: "outline" },
  TENDER: { label: "統包招標", variant: "outline" },
  CONSTRUCTION: { label: "施工監造", variant: "secondary" },
  COMMISSIONING: { label: "試運轉", variant: "outline" },
  HANDOVER: { label: "竣工移交", variant: "outline" },
  OTHER: { label: "其他", variant: "outline" },
};

/**
 * 風險燈號（公共工程慣用五級）。PURPLE 表示受外部機關進度牽制。
 * dot 為壓低彩度的小圓點色票；這是全表唯一保留色彩編碼的欄位，
 * 因此不再另外配彩色標籤，僅在需要文字時用中性 variant。
 */
export const obligationRiskMeta: Record<
  ObligationRisk,
  Meta & { dot: string; short: string }
> = {
  GREEN: { label: "低風險", short: "綠", variant: "muted", dot: "bg-risk-green" },
  YELLOW: { label: "中風險", short: "黃", variant: "muted", dot: "bg-risk-yellow" },
  ORANGE: { label: "偏高風險", short: "橙", variant: "muted", dot: "bg-risk-orange" },
  RED: { label: "高風險", short: "紅", variant: "muted", dot: "bg-risk-red" },
  PURPLE: { label: "外部依賴", short: "紫", variant: "muted", dot: "bg-risk-purple" },
};

/** 觸發方式同為分類資訊 → 中性。 */
export const obligationTriggerMeta: Record<ObligationTrigger, Meta> = {
  FIXED_DATE: { label: "固定日期", variant: "outline" },
  RELATIVE_DUE: { label: "相對期限", variant: "outline" },
  PREDECESSOR: { label: "前置事項", variant: "outline" },
  CONDITION: { label: "條件觸發", variant: "outline" },
};

/** 狀態才是需要判讀的資訊，但只有「逾期」值得搶注意。 */
export const obligationStatusMeta: Record<ObligationStatus, Meta> = {
  NOT_STARTED: { label: "未起算", variant: "muted" },
  IN_PROGRESS: { label: "辦理中", variant: "warning" },
  PENDING_REVIEW: { label: "待審", variant: "secondary" },
  PENDING_EXTERNAL: { label: "待機關", variant: "secondary" },
  OVERDUE: { label: "逾期", variant: "destructive" },
  DONE: { label: "完成", variant: "muted" },
};

const opts = <T extends string>(meta: Record<T, { label: string }>) =>
  (Object.keys(meta) as T[]).map((value) => ({ value, label: meta[value].label }));

export const obligationStageOptions = opts(obligationStageMeta);
export const obligationRiskOptions = opts(obligationRiskMeta);
export const obligationTriggerOptions = opts(obligationTriggerMeta);
export const obligationStatusOptions = opts(obligationStatusMeta);
