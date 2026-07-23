"use server";

import { revalidatePath } from "next/cache";

import * as people from "@/service/people.service";
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
