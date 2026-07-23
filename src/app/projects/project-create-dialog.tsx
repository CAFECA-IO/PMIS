"use client";

import { createProject } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CityCombobox } from "@/components/city-combobox";
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";
import { projectStatusOptions } from "@/constant/pmis";

function Field({
  label,
  name,
  required,
  type = "text",
  placeholder,
  colSpan,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  colSpan?: boolean;
}) {
  return (
    <div className={colSpan ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={name}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      <Input id={name} name={name} type={type} required={required} placeholder={placeholder} />
    </div>
  );
}

export function ProjectCreateDialog() {
  return (
    <CreateRecordDialog
      title="新增專案"
      triggerLabel="新增專案"
      action={(fd) => createProject({}, fd)}
      submitLabel="建立專案"
    >
      <Field label="專案編號" name="code" required placeholder="PMIS-2026-004" />
      <Field label="專案名稱" name="name" required placeholder="○○新建工程" />
      <div className="space-y-1.5">
        <Label htmlFor="location">地點</Label>
        <CityCombobox
          id="location"
          name="location"
          placeholder="輸入城市名稱或代碼搜尋"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status">狀態</Label>
        <Select id="status" name="status" defaultValue="PLANNING">
          {projectStatusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <Field label="業主" name="client" placeholder="主辦機關" />
      <Field label="承包商" name="contractor" />
      <Field label="監造單位" name="supervisor" />
      <Field label="預算 (TWD)" name="budget" type="number" placeholder="0" />
      <Field label="開工日" name="startDate" type="date" />
      <Field label="完工日" name="endDate" type="date" />
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="description">工程摘要</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>
    </CreateRecordDialog>
  );
}
