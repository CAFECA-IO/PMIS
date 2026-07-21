"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { createDocumentAction, type DocActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

type Option = { id: string; name: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "建立中…" : "建立簽核文件"}
    </Button>
  );
}

export function DocumentForm({
  applicants,
  workflows,
}: {
  applicants: Option[];
  workflows: Option[];
}) {
  const [state, formAction] = useActionState<DocActionState, FormData>(
    createDocumentAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="doc-title">文件標題 *</Label>
          <Input id="doc-title" name="title" placeholder="如：連續壁施工計畫書審核" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-applicant">申請者 *</Label>
          <Select id="doc-applicant" name="applicantId" defaultValue="">
            <option value="" disabled>
              選擇申請者
            </option>
            {applicants.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-workflow">簽核流程 *</Label>
          <Select id="doc-workflow" name="workflowId" defaultValue="">
            <option value="" disabled>
              選擇流程
            </option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="doc-desc">說明</Label>
          <Textarea id="doc-desc" name="description" rows={2} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="doc-files">參考文件（PDF / PNG / JPG，可多選）</Label>
          <Input
            id="doc-files"
            name="files"
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg"
            className="file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm"
          />
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
