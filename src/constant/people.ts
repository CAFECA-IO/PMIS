import type { AccountRole, AccountStatus } from "@/generated/prisma/enums";

import type { BadgeMeta as Meta } from "@/constant/badge";

export const accountRoleMeta: Record<AccountRole, Meta> = {
  ADMIN: { label: "系統管理員", variant: "secondary" },
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
