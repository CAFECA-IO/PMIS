import type {
  ProjectStatus,
  WorkItemStatus,
  InspectionType,
  InspectionResult,
  DefectSeverity,
  DefectStatus,
  ProjectDocumentCategory,
  PaymentStatus,
  ReminderCategory,
  ReminderStatus,
  NotificationStatus,
  EhsType,
  EhsResult,
  SubmittalCategory,
  SubmittalStatus,
  ReviewResult,
  MediaType,
  ReportStatus,
  ProjectMemberRole,
  CarbonScope,
  CarbonEntryStatus,
  CarbonIntensityBasis,
  FinancialDirection,
  VoucherStatus,
} from "@/generated/prisma/enums";

import type { BadgeMeta as Meta } from "@/constant/badge";

export const projectStatusMeta: Record<ProjectStatus, Meta> = {
  PLANNING: { label: "規劃中", variant: "muted" },
  ACTIVE: { label: "施工中", variant: "default" },
  ON_HOLD: { label: "暫停", variant: "warning" },
  COMPLETED: { label: "已完工", variant: "success" },
  CANCELLED: { label: "已取消", variant: "muted" },
};

export const projectMemberRoleMeta: Record<ProjectMemberRole, Meta> = {
  MANAGER: { label: "專案經理", variant: "secondary" },
  SUPERVISOR: { label: "監造", variant: "secondary" },
  INSPECTOR: { label: "查驗", variant: "warning" },
  MEMBER: { label: "成員", variant: "muted" },
};

export const projectMemberRoleOptions = Object.entries(
  projectMemberRoleMeta,
).map(([value, meta]) => ({ value, label: meta.label }));

// ── PMIS-10 碳盤查 ──────────────────────────────────────────
export const carbonScopeMeta: Record<CarbonScope, Meta> = {
  SCOPE_1: { label: "範疇一 直接排放", variant: "outline" },
  SCOPE_2: { label: "範疇二 外購電力", variant: "warning" },
  SCOPE_3: { label: "範疇三 上下游", variant: "secondary" },
};

/** 分範疇圖表用色（對應 CSS 色票）。 */
export const carbonScopeColor: Record<CarbonScope, string> = {
  SCOPE_1: "var(--destructive)",
  SCOPE_2: "#f59e0b",
  SCOPE_3: "var(--primary)",
};

export const carbonScopeOptions = Object.entries(carbonScopeMeta).map(
  ([value, meta]) => ({ value, label: meta.label }),
);

export const carbonEntryStatusMeta: Record<CarbonEntryStatus, Meta> = {
  DRAFT: { label: "草稿", variant: "muted" },
  CONFIRMED: { label: "已確認", variant: "secondary" },
  VERIFIED: { label: "已查證", variant: "success" },
};

export const carbonIntensityBasisMeta: Record<CarbonIntensityBasis, Meta> = {
  CONTRACT_AMOUNT: { label: "契約金額", variant: "secondary" },
  FLOOR_AREA: { label: "樓地板面積", variant: "secondary" },
  DURATION: { label: "工期", variant: "secondary" },
};

export const carbonIntensityBasisOptions = Object.entries(
  carbonIntensityBasisMeta,
).map(([value, meta]) => ({ value, label: meta.label }));

// ── PMIS-08 財務管理 ────────────────────────────────────────
export const financialDirectionMeta: Record<FinancialDirection, Meta> = {
  INCOME: { label: "收入", variant: "success" },
  EXPENSE: { label: "支出", variant: "outline" },
};

export const voucherStatusMeta: Record<VoucherStatus, Meta> = {
  DRAFT: { label: "草稿", variant: "muted" },
  CONFIRMED: { label: "已確認", variant: "secondary" },
};

export const financeCategoryOptions = [
  "工程估驗款",
  "追加減帳",
  "材料",
  "人工",
  "機具",
  "分包工程",
  "管理費",
  "稅費",
  "保險",
  "其他",
];

export const workItemStatusMeta: Record<WorkItemStatus, Meta> = {
  NOT_STARTED: { label: "未開始", variant: "muted" },
  IN_PROGRESS: { label: "進行中", variant: "default" },
  COMPLETED: { label: "已完成", variant: "success" },
  DELAYED: { label: "延遲", variant: "destructive" },
};

export const inspectionTypeMeta: Record<InspectionType, Meta> = {
  MATERIAL: { label: "材料查驗", variant: "secondary" },
  PROCESS: { label: "施工查驗", variant: "secondary" },
  ACCEPTANCE: { label: "驗收查驗", variant: "secondary" },
  SAFETY: { label: "安全查驗", variant: "secondary" },
};

export const inspectionResultMeta: Record<InspectionResult, Meta> = {
  PENDING: { label: "待查驗", variant: "muted" },
  PASSED: { label: "合格", variant: "success" },
  FAILED: { label: "不合格", variant: "destructive" },
  CONDITIONAL: { label: "有條件通過", variant: "warning" },
};

export const defectSeverityMeta: Record<DefectSeverity, Meta> = {
  LOW: { label: "低", variant: "muted" },
  MEDIUM: { label: "中", variant: "warning" },
  HIGH: { label: "高", variant: "destructive" },
  CRITICAL: { label: "嚴重", variant: "destructive" },
};

export const defectStatusMeta: Record<DefectStatus, Meta> = {
  OPEN: { label: "待處理", variant: "warning" },
  IN_PROGRESS: { label: "處理中", variant: "warning" },
  RESOLVED: { label: "已改善", variant: "success" },
  CLOSED: { label: "結案", variant: "muted" },
};

export const projectDocumentCategoryMeta: Record<
  ProjectDocumentCategory,
  Meta
> = {
  CONTRACT: { label: "契約", variant: "outline" },
  AMENDMENT: { label: "契約變更", variant: "warning" },
  DRAWING: { label: "圖說", variant: "secondary" },
  PERMIT: { label: "許可證照", variant: "secondary" },
  REPORT: { label: "報告", variant: "secondary" },
  OTHER: { label: "其他", variant: "muted" },
};

export const projectDocumentCategoryOptions = Object.entries(
  projectDocumentCategoryMeta,
).map(([value, meta]) => ({ value, label: meta.label }));

export const paymentStatusMeta: Record<PaymentStatus, Meta> = {
  PENDING: { label: "待計價", variant: "muted" },
  INVOICED: { label: "已請款", variant: "warning" },
  PAID: { label: "已付款", variant: "success" },
};

export const reminderCategoryMeta: Record<ReminderCategory, Meta> = {
  DEADLINE: { label: "履約期限", variant: "outline" },
  MEETING: { label: "會議", variant: "secondary" },
  SUBMITTAL: { label: "送審", variant: "outline" },
  AUDIT: { label: "查核", variant: "warning" },
  IMPROVEMENT: { label: "改善期限", variant: "warning" },
  OTHER: { label: "其他", variant: "muted" },
};

export const reminderStatusMeta: Record<ReminderStatus, Meta> = {
  UPCOMING: { label: "即將到期", variant: "secondary" },
  DUE_SOON: { label: "接近期限", variant: "warning" },
  OVERDUE: { label: "已逾期", variant: "destructive" },
  DONE: { label: "已完成", variant: "success" },
};

export const notificationStatusMeta: Record<NotificationStatus, Meta> = {
  PENDING: { label: "待處理", variant: "muted" },
  IN_PROGRESS: { label: "處理中", variant: "warning" },
  DONE: { label: "已完成", variant: "success" },
  OVERDUE: { label: "已逾期", variant: "destructive" },
};

export const ehsTypeMeta: Record<EhsType, Meta> = {
  SAFETY: { label: "職業安全", variant: "secondary" },
  ENVIRONMENT: { label: "環境保護", variant: "secondary" },
  TRAFFIC: { label: "交通維持", variant: "secondary" },
  HEALTH: { label: "衛生", variant: "secondary" },
};

export const ehsResultMeta: Record<EhsResult, Meta> = {
  PENDING: { label: "待稽核", variant: "muted" },
  PASS: { label: "合格", variant: "success" },
  FAIL: { label: "不合格", variant: "destructive" },
  IMPROVING: { label: "改善中", variant: "warning" },
};

export const ehsTypeOptions = Object.entries(ehsTypeMeta).map(
  ([value, meta]) => ({ value, label: meta.label }),
);
export const ehsResultOptions = Object.entries(ehsResultMeta).map(
  ([value, meta]) => ({ value, label: meta.label }),
);

export const submittalCategoryMeta: Record<SubmittalCategory, Meta> = {
  DESIGN: { label: "設計", variant: "secondary" },
  CONSTRUCTION: { label: "施工", variant: "secondary" },
  MATERIAL: { label: "材料設備", variant: "secondary" },
  TEST_REPORT: { label: "試驗報告", variant: "secondary" },
};

export const submittalStatusMeta: Record<SubmittalStatus, Meta> = {
  DRAFT: { label: "草稿", variant: "muted" },
  SUBMITTED: { label: "已送審", variant: "info" },
  UNDER_REVIEW: { label: "審查中", variant: "warning" },
  RETURNED: { label: "退件", variant: "destructive" },
  APPROVED: { label: "審查通過", variant: "success" },
};

export const reviewResultMeta: Record<ReviewResult, Meta> = {
  PENDING: { label: "待審", variant: "muted" },
  APPROVED: { label: "核可", variant: "success" },
  REJECTED: { label: "駁回", variant: "destructive" },
  CONDITIONAL: { label: "有條件核可", variant: "warning" },
};

export const mediaTypeMeta: Record<MediaType, Meta> = {
  PHOTO: { label: "照片", variant: "secondary" },
  VIDEO: { label: "影片", variant: "secondary" },
  DOCUMENT: { label: "文件", variant: "secondary" },
  DRAWING: { label: "圖說", variant: "secondary" },
  REPORT: { label: "報表", variant: "secondary" },
};

export const reportStatusMeta: Record<ReportStatus, Meta> = {
  DRAFT: { label: "草稿", variant: "muted" },
  SUBMITTED: { label: "已提送", variant: "info" },
  APPROVED: { label: "已核備", variant: "success" },
};

export const projectStatusOptions = Object.entries(projectStatusMeta).map(
  ([value, meta]) => ({ value, label: meta.label }),
);
