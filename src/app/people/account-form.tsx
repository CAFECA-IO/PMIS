"use client";

import { createAccountAction } from "./actions";
import { accountRoleOptions } from "@/constant/people";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";

type Option = { id: string; name: string };

export function AccountForm({
  orgOptions,
  positionOptions,
}: {
  orgOptions: Option[];
  positionOptions: Option[];
}) {
  return (
    <CreateRecordDialog
      title="新增帳號"
      triggerLabel="新增帳號"
      action={(fd) => createAccountAction({}, fd)}
    >
      <div className="space-y-1.5">
        <Label htmlFor="acc-name">姓名 *</Label>
        <Input id="acc-name" name="name" placeholder="王小明" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="acc-email">Email *</Label>
        <Input id="acc-email" name="email" type="email" placeholder="user@cafeca.com.tw" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="acc-phone">電話</Label>
        <Input id="acc-phone" name="phone" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="acc-role">角色</Label>
        <Select id="acc-role" name="role" defaultValue="MEMBER">
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
    </CreateRecordDialog>
  );
}
