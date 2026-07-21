import type { AccountRole } from "@/generated/prisma/enums";

/** Session cookie name (kept in a prisma-free module so middleware can import it). */
export const SESSION_COOKIE = "pmis_uid";

/** Roles that may see every project regardless of assignment. */
export function canSeeAllProjects(role: AccountRole): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
