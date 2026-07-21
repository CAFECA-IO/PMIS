"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { createAccountAction, type PeopleActionState } from "./actions";
import { accountRoleOptions } from "@/constant/people";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Option = { id: string; name: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "新增中…" : "新增帳號"}
    </Button>
  );
}

export function AccountForm({
  orgOptions,
  positionOptions,
}: {
  orgOptions: Option[];
  positionOptions: Option[];
}) {
  const [state, formAction] = useActionState<PeopleActionState, FormData>(
    createAccountAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"
    >
      {state.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">
          {state.error}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="acc-name">姓名 *</Label>
        <Input id="acc-name" name="name" placeholder="王小明" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="acc-email">Email *</Label>
        <Input id="acc-email" name="email" type="email" placeholder="user@cafeca.com.tw" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="acc-phone">電話</Label>
        <Input id="acc-phone" name="phone" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="acc-role">角色</Label>
        <Select id="acc-role" name="role" defaultValue="ENGINEER">
          {accountRoleOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="acc-org">組織</Label>
        <Select id="acc-org" name="orgUnitId" defaultValue="">
          <option value="">（未指派）</option>
          {orgOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="acc-position">職位</Label>
        <Select id="acc-position" name="positionId" defaultValue="">
          <option value="">（未指派）</option>
          {positionOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <SubmitButton />
      </div>
    </form>
  );
}
