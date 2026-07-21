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
  MANAGER: { label: "計畫主管", variant: "secondary" },
  ENGINEER: { label: "監造工程師", variant: "secondary" },
  INSPECTOR: { label: "查驗人員", variant: "secondary" },
  VIEWER: { label: "唯讀", variant: "muted" },
};

export const accountStatusMeta: Record<AccountStatus, Meta> = {
  ACTIVE: { label: "啟用", variant: "success" },
  DISABLED: { label: "停用", variant: "muted" },
};

export const accountRoleOptions = Object.entries(accountRoleMeta).map(
  ([value, meta]) => ({ value, label: meta.label }),
);
