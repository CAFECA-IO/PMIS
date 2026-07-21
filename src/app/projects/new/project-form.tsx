"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import { createProject, type ActionState } from "../actions";
import { projectStatusOptions } from "@/constant/pmis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "儲存中…" : "建立專案"}
    </Button>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}

export function ProjectForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createProject,
    {},
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="專案編號" name="code" required placeholder="PMIS-2026-004" />
        <Field label="專案名稱" name="name" required placeholder="○○新建工程" />
        <Field label="地點" name="location" placeholder="縣市 / 行政區" />
        <div className="space-y-2">
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">工程摘要</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton />
        <Button variant="ghost" asChild>
          <Link href="/projects">取消</Link>
        </Button>
      </div>
    </form>
  );
}
