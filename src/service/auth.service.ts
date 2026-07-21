import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import * as accountRepo from "@/repository/account.repository";
import { SESSION_COOKIE } from "@/lib/auth";

export type CurrentUser = NonNullable<
  Awaited<ReturnType<typeof accountRepo.findById>>
>;

/** Resolve the logged-in account from the session cookie, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const uid = store.get(SESSION_COOKIE)?.value;
  if (!uid) return null;
  const account = await accountRepo.findById(uid);
  if (!account || account.status !== "ACTIVE") return null;
  return account;
}

/** Same as getCurrentUser but redirects to /login when unauthenticated. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Set the session cookie for a validated account id. */
export async function login(accountId: string): Promise<boolean> {
  const account = await accountRepo.findById(accountId);
  if (!account || account.status !== "ACTIVE") return false;
  const store = await cookies();
  store.set(SESSION_COOKIE, account.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Active accounts offered on the login screen. */
export function listLoginAccounts() {
  return accountRepo.listActive();
}
