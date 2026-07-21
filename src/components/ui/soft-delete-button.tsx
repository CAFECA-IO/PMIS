"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "./button";
import { useNotification } from "./notification";

export function SoftDeleteButton({
  id,
  label,
  name,
  onDelete,
  onRestore,
}: {
  id: string;
  label: string; // 類型名稱，如「帳號」
  name?: string; // 被刪除項目名稱
  onDelete: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const { notify } = useNotification();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`刪除${label}`}
      onClick={async () => {
        await onDelete(id);
        notify({
          title: `已刪除${label}`,
          description: `${name ? `「${name}」` : ""}90 天內可復原。`,
          actionLabel: "復原",
          onAction: async () => {
            await onRestore(id);
            router.refresh();
          },
        });
        router.refresh();
      }}
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );
}
