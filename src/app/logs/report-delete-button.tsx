"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useNotification } from "@/components/ui/notification";
import { deleteReportAction } from "./actions";

export function ReportDeleteButton({
  id,
  label,
}: {
  id: string;
  label: string;
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
            title: "刪除監造報表？",
            description: `${label} 的日報將被移除。`,
          })
        ) {
          await deleteReportAction(id);
          notify({ title: "已刪除日報", description: label });
          router.refresh();
        }
      }}
    >
      <Trash2 className="size-4 text-muted-foreground" />
      刪除
    </Button>
  );
}
