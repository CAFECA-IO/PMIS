import { redirect } from "next/navigation";

import * as auth from "@/service/auth.service";
import { accountRoleMeta } from "@/constant/people";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "登入 — PMIS" };

export default async function LoginPage() {
  // Already logged in with a valid session → go home. A stale cookie resolves
  // to null here, so the login form still renders (no redirect loop).
  const current = await auth.getCurrentUser();
  if (current) redirect("/");

  const accounts = await auth.listLoginAccounts();
  const options = accounts.map((a) => ({
    id: a.id,
    label: `${a.name}（${accountRoleMeta[a.role].label}）· ${a.email}`,
  }));

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="h-10 w-auto" />
          <div className="leading-tight">
            <div className="text-base font-semibold">PMIS</div>
            <div className="text-xs text-muted-foreground">智慧監造管理系統</div>
          </div>
        </div>
        <h1 className="mb-1 text-lg font-semibold">登入</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          請選擇您的帳號登入。您將只會看到被指派的專案。
        </p>
        <LoginForm accounts={options} />
      </div>
    </div>
  );
}
