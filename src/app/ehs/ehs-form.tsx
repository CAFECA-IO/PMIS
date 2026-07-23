"use client";

import { CreateRecordDialog } from "@/components/ui/create-record-dialog";
import { createEhsAction } from "./actions";
import { EhsDialogFields } from "./ehs-dialog-fields";

export function EhsForm({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        您目前沒有可新增稽核的專案。
      </p>
    );
  }

  return (
    <CreateRecordDialog
      title="新增稽核"
      triggerLabel="新增稽核"
      action={createEhsAction}
      submitLabel="建立稽核"
    >
      <EhsDialogFields projects={projects} />
    </CreateRecordDialog>
  );
}
