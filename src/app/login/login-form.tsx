"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { loginAction, type LoginState } from "./actions";

type Option = { id: string; label: string };

export function LoginForm({ accounts }: { accounts: Option[] }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="accountId">選擇帳號</Label>
        <Select id="accountId" name="accountId" defaultValue="">
          <option value="" disabled>
            請選擇…
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        <LogIn className="size-4" />
        {pending ? "登入中…" : "登入"}
      </Button>
    </form>
  );
}
