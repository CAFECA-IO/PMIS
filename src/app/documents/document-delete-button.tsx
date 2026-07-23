"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useNotification } from "@/components/ui/notification";
import { deleteDocumentAction } from "./actions";

export function DocumentDeleteButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { notify } = useNotification();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`刪除 ${title}`}
      onClick={async () => {
        if (
          await confirm({
            title: "刪除文件？",
            description: `「${title}」的資料庫記錄將被移除。`,
          })
        ) {
          await deleteDocumentAction(id);
          notify({ title: "已刪除文件", description: title });
          router.refresh();
        }
      }}
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );
}
