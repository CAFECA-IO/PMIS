import type { AccountRole } from "@/generated/prisma/enums";

// Info: (20260721 - Luphia) session cookie 名稱（置於無 prisma 依賴的模組，供 middleware 匯入）
export const SESSION_COOKIE = "pmis_uid";

// Info: (20260721 - Luphia) 可檢視全部專案（不受指派限制）的角色
export function canSeeAllProjects(role: AccountRole): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
