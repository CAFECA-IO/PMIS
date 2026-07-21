"use server";

import { revalidatePath } from "next/cache";

import * as people from "@/service/people.service";

export type PeopleActionState = { error?: string; ok?: boolean };

function f(fd: FormData, k: string): string | undefined {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
}

function refresh() {
  revalidatePath("/people");
}

export async function createAccountAction(
  _prev: PeopleActionState,
  fd: FormData,
): Promise<PeopleActionState> {
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
  await people.createOrgUnit({
    name: f(fd, "name"),
    code: f(fd, "code"),
    parentId: f(fd, "parentId"),
  });
  refresh();
}

export async function createPositionAction(fd: FormData) {
  await people.createPosition({ name: f(fd, "name"), rank: f(fd, "rank") });
  refresh();
}

export async function setAccountStatusAction(id: string, status: string) {
  await people.setAccountStatus(id, status);
  refresh();
}

export async function deleteAccountAction(id: string) {
  await people.deleteAccount(id);
  refresh();
}
export async function restoreAccountAction(id: string) {
  await people.restoreAccount(id);
  refresh();
}
export async function deleteOrgUnitAction(id: string) {
  await people.deleteOrgUnit(id);
  refresh();
}
export async function restoreOrgUnitAction(id: string) {
  await people.restoreOrgUnit(id);
  refresh();
}
export async function deletePositionAction(id: string) {
  await people.deletePosition(id);
  refresh();
}
export async function restorePositionAction(id: string) {
  await people.restorePosition(id);
  refresh();
}
