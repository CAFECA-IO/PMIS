import type { ApprovalStatus, StepDecision } from "@/generated/prisma/enums";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "muted";

type Meta = { label: string; variant: BadgeVariant };

export const approvalStatusMeta: Record<ApprovalStatus, Meta> = {
  PENDING: { label: "簽核中", variant: "warning" },
  APPROVED: { label: "已核准", variant: "success" },
  REJECTED: { label: "已駁回", variant: "destructive" },
  CANCELLED: { label: "已取消", variant: "muted" },
};

export const stepDecisionMeta: Record<StepDecision, Meta> = {
  PENDING: { label: "待簽核", variant: "muted" },
  APPROVED: { label: "已核准", variant: "success" },
  REJECTED: { label: "已駁回", variant: "destructive" },
};
