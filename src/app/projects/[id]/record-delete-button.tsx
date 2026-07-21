"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useNotification } from "@/components/ui/notification";

export function RecordDeleteButton({
  id,
  projectId,
  label,
  onDelete,
  onRestore,
}: {
  id: string;
  projectId: string;
  label: string;
  onDelete: (id: string, projectId: string) => Promise<void>;
  onRestore: (id: string, projectId: string) => Promise<void>;
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
        await onDelete(id, projectId);
        notify({
          title: `已刪除${label}`,
          description: "90 天內可復原。",
          actionLabel: "復原",
          onAction: async () => {
            await onRestore(id, projectId);
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
