"use client";

import { useRouter } from "next/navigation";
import { CheckCheck, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-provider";
import type { TodoStatus } from "@/generated/prisma/enums";
import { markReadAction, setTodoStatusAction } from "./actions";

// Info: (20260721 - Luphia) 待辦標記（已讀／已處理），皆經統一 confirm 對話框確認
export function TodoActions({
  id,
  status,
  read,
  title,
}: {
  id: string;
  status: TodoStatus;
  read: boolean;
  title: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const done = status === "DONE";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {!read ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            if (await confirm({ title: "標記為已讀？", description: title })) {
              await markReadAction(id);
              router.refresh();
            }
          }}
        >
          <Eye className="size-4" />
          已讀
        </Button>
      ) : null}
      {!done ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={async () => {
            if (
              await confirm({
                title: "標記為已處理？",
                description: `將「${title}」標記為已完成。`,
              })
            ) {
              await setTodoStatusAction(id, "DONE");
              router.refresh();
            }
          }}
        >
          <CheckCheck className="size-4" />
          已處理
        </Button>
      ) : null}
    </div>
  );
}
