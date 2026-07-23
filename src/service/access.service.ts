import { redirect } from "next/navigation";

import { getCurrentUser } from "@/service/auth.service";
import * as positionRepo from "@/repository/position.repository";
import {
  PMIS_MODULES,
  parseModulePermissions,
  type ModulePermissionLevel,
} from "@/constant/modules";
import type { AccountRole } from "@/generated/prisma/enums";

export type ModulePermissions = Record<string, ModulePermissionLevel>;

type AccessUser = { role: AccountRole; positionId?: string | null };

/**
 * 取得使用者對各模組的權限（依其職位設定）。
 * ADMIN 一律全可編輯（系統管理者不受限）；其餘依職位 modulePermissions，未設定者為「無」。
 */
export async function getUserModulePermissions(
  user: AccessUser,
): Promise<ModulePermissions> {
  const out: ModulePermissions = {};
  if (user.role === "ADMIN") {
    for (const m of PMIS_MODULES) out[m.key] = "EDIT";
    return out;
  }
  const raw = user.positionId
    ? await positionRepo.getPermissions(user.positionId)
    : null;
  const parsed = parseModulePermissions(raw);
  for (const m of PMIS_MODULES) out[m.key] = parsed[m.key] ?? "NONE";
  return out;
}

export function canAccessModule(perms: ModulePermissions, key: string): boolean {
  return perms[key] === "VIEW" || perms[key] === "EDIT";
}

export function canEditModule(perms: ModulePermissions, key: string): boolean {
  return perms[key] === "EDIT";
}

/** 可存取的模組路由集合（供側欄過濾）。 */
export function accessibleRoutes(perms: ModulePermissions): string[] {
  return PMIS_MODULES.filter((m) => canAccessModule(perms, m.key)).map(
    (m) => m.key,
  );
}

/**
 * 頁面守門：驗證使用者對該模組的權限，不足則導回儀表板。
 * level "VIEW"＝可進入；"EDIT"＝需可編輯。回傳權限供頁面判斷是否顯示新建/編輯。
 */
/** 供 server action 後端把關：目前登入者是否可編輯該模組。 */
export async function currentUserCanEdit(route: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const perms = await getUserModulePermissions(user);
  return canEditModule(perms, route);
}

export async function assertModuleAccess(
  user: AccessUser,
  route: string,
  level: "VIEW" | "EDIT" = "VIEW",
): Promise<ModulePermissions> {
  const perms = await getUserModulePermissions(user);
  const ok =
    level === "EDIT"
      ? canEditModule(perms, route)
      : canAccessModule(perms, route);
  if (!ok) redirect("/");
  return perms;
}
