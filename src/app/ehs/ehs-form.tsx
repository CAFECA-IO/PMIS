"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ehsTypeOptions, ehsResultOptions } from "@/constant/pmis";
import { createEhsAction } from "./actions";

const today = () => new Date().toISOString().slice(0, 10);

export function EhsForm({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        您目前沒有可新增稽核的專案。
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        手動新增稽核紀錄
      </Button>
    );
  }

  return (
    <form
      action={createEhsAction}
      className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"
    >
      <div className="space-y-1.5">
        <Label htmlFor="ehs-project">專案</Label>
        <Select id="ehs-project" name="projectId" defaultValue={projects[0].id}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ehs-type">類別</Label>
        <Select id="ehs-type" name="type" defaultValue="SAFETY">
          {ehsTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ehs-date">稽核日期</Label>
        <Input id="ehs-date" name="auditedAt" type="date" defaultValue={today()} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ehs-loc">地點</Label>
        <Input id="ehs-loc" name="location" placeholder="如 B1 開挖區" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ehs-result">結果</Label>
        <Select id="ehs-result" name="result" defaultValue="PENDING">
          {ehsResultOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ehs-due">改善期限</Label>
        <Input id="ehs-due" name="dueDate" type="date" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="ehs-find">缺失情形</Label>
        <Textarea id="ehs-find" name="findings" rows={2} placeholder="描述缺失或稽核情形…" />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit">建立紀錄</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          取消
        </Button>
      </div>
    </form>
  );
}
