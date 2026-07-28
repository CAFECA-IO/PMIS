"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useNotification } from "@/components/ui/notification";
import { deleteWorkItemAction } from "../actions";

export function WorkItemDeleteButton({
  id,
  projectId,
  name,
}: {
  id: string;
  projectId: string;
  name: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { notify } = useNotification();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        if (
          await confirm({
            title: "刪除工程分項？",
            description: `「${name}」將一併移除其查驗/缺失的關聯，且無法復原。`,
          })
        ) {
          await deleteWorkItemAction(id, projectId);
          notify({ title: "已刪除工程分項", description: name });
          router.refresh();
        }
      }}
    >
      <Trash2 className="size-4 text-muted-foreground" />
      刪除
    </Button>
  );
}
