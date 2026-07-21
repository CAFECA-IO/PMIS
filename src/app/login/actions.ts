"use server";

import { redirect } from "next/navigation";

import * as auth from "@/service/auth.service";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const accountId = formData.get("accountId");
  if (typeof accountId !== "string" || !accountId) {
    return { error: "請選擇要登入的帳號。" };
  }
  const ok = await auth.login(accountId);
  if (!ok) return { error: "帳號不存在或已停用。" };
  redirect("/");
}

export async function logoutAction() {
  await auth.logout();
  redirect("/login");
}
