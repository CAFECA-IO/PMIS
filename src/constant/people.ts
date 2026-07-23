import type { AccountRole, AccountStatus } from "@/generated/prisma/enums";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "muted";

type Meta = { label: string; variant: BadgeVariant };

export const accountRoleMeta: Record<AccountRole, Meta> = {
  ADMIN: { label: "系統管理員", variant: "default" },
  MANAGER: { label: "計畫主管（可見全部專案）", variant: "secondary" },
  MEMBER: { label: "一般成員（僅指派專案）", variant: "muted" },
};

export const accountStatusMeta: Record<AccountStatus, Meta> = {
  ACTIVE: { label: "啟用", variant: "success" },
  DISABLED: { label: "停用", variant: "muted" },
};

export const accountRoleOptions = Object.entries(accountRoleMeta).map(
  ([value, meta]) => ({ value, label: meta.label }),
);
