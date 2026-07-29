"use client";

import { createDocumentAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";

type Option = { id: string; name: string };

export function DocumentForm({
  applicants,
  workflows,
}: {
  applicants: Option[];
  workflows: Option[];
}) {
  return (
    <CreateRecordDialog
      title="建立簽核文件"
      assistId="approval-document"
      triggerLabel="新建簽核文件"
      action={(fd) => createDocumentAction({}, fd)}
      submitLabel="建立"
      fileFieldName="files"
      fileMultiple
      fileAccept=".pdf,.png,.jpg,.jpeg"
      fileHint="參考文件，可多選（PDF / PNG / JPG）"
    >
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
    </CreateRecordDialog>
  );
}
