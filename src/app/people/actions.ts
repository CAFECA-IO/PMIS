"use server";

import { revalidatePath } from "next/cache";

import * as people from "@/service/people.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { canSeeAllProjects } from "@/lib/auth";
import { PMIS_MODULES } from "@/constant/modules";
import { currentUserCanEdit } from "@/service/access.service";
// createPositionAction 已由 createPositionWithPermsAction 取代（新增職位同時設定權限）

export type PeopleActionState = { error?: string; ok?: boolean };

function f(fd: FormData, k: string): string | undefined {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
}

function refresh() {
  revalidatePath("/people");
}

async function canEdit() {
  return currentUserCanEdit("/people");
}

function readPerms(fd: FormData): Record<string, string> {
  const perms: Record<string, string> = {};
  for (const m of PMIS_MODULES) {
    const v = fd.get(`perm:${m.key}`);
    if (typeof v === "string") perms[m.key] = v;
  }
  return perms;
}

export async function createPositionWithPermsAction(fd: FormData) {
  if (!(await canEdit())) return;
  await people.createPositionWithPermissions(
    { name: f(fd, "name"), rank: f(fd, "rank") },
    readPerms(fd),
  );
  refresh();
}

export async function updatePositionPermsAction(fd: FormData) {
  if (!(await canEdit())) return;
  const id = f(fd, "positionId");
  if (!id) return;
  await people.savePositionPermissions(id, readPerms(fd));
  refresh();
}

export async function createAccountAction(
  _prev: PeopleActionState,
  fd: FormData,
): Promise<PeopleActionState> {
  if (!(await canEdit())) return { error: "權限不足，無法編輯此模組。" };
  const r = await people.createAccount({
    name: f(fd, "name"),
    email: f(fd, "email"),
    phone: f(fd, "phone"),
    role: f(fd, "role"),
    status: f(fd, "status"),
    orgUnitId: f(fd, "orgUnitId"),
    positionId: f(fd, "positionId"),
  });
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function createOrgUnitAction(fd: FormData) {
  if (!(await canEdit())) return;
  await people.createOrgUnit({
    name: f(fd, "name"),
    code: f(fd, "code"),
    parentId: f(fd, "parentId"),
  });
  refresh();
}

export async function createPositionAction(fd: FormData) {
  if (!(await canEdit())) return;
  await people.createPosition({ name: f(fd, "name"), rank: f(fd, "rank") });
  refresh();
}

export async function setAccountStatusAction(id: string, status: string) {
  if (!(await canEdit())) return;
  await people.setAccountStatus(id, status);
  refresh();
}

export async function deleteAccountAction(id: string) {
  if (!(await canEdit())) return;
  await people.deleteAccount(id);
  refresh();
}
export async function restoreAccountAction(id: string) {
  if (!(await canEdit())) return;
  await people.restoreAccount(id);
  refresh();
}
export async function deleteOrgUnitAction(id: string) {
  if (!(await canEdit())) return;
  await people.deleteOrgUnit(id);
  refresh();
}
export async function restoreOrgUnitAction(id: string) {
  if (!(await canEdit())) return;
  await people.restoreOrgUnit(id);
  refresh();
}
export async function deletePositionAction(id: string) {
  if (!(await canEdit())) return;
  await people.deletePosition(id);
  refresh();
}
export async function restorePositionAction(id: string) {
  if (!(await canEdit())) return;
  await people.restorePosition(id);
  refresh();
}

// ── 專案配置（自專案頁遷入） ──────────────────────────────
/*
  專案成員原本在專案頁的「人力配置」分頁維護。專案頁收斂為三個分頁後，
  這件事搬到帳號管理 —— 它本來就更接近「誰是誰、誰能碰什麼」，
  而非某一個專案的內容。

  權限沿用兩層：模組層的 /people 編輯權，加上服務層的
  canSeeAllProjects（只有系統管理員與計畫主管能調整人力）。
  少了第二層，任何能編輯帳號的人都能把自己加進任何專案。
*/
export async function assignProjectMemberAction(formData: FormData) {
  if (!(await canEdit())) return;
  const me = await requireUser();
  if (!canSeeAllProjects(me.role)) return;

  const projectId = f(formData, "projectId");
  if (!projectId) return;
  await projectService.addProjectMember({
    projectId,
    accountId: f(formData, "accountId"),
    role: f(formData, "role"),
  });
  refresh();
  // 該專案的畫面也會因成員變動而改變可見範圍
  revalidatePath(`/projects/${projectId}`);
}

export async function unassignProjectMemberAction(id: string) {
  if (!(await canEdit())) return;
  const me = await requireUser();
  if (!canSeeAllProjects(me.role)) return;
  await projectService.removeProjectMember(id);
  refresh();
}
