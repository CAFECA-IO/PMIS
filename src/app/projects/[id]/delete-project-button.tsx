"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { ConfirmForm } from "@/components/ui/confirm-dialog";
import { useNotification } from "@/components/ui/notification";
import { deleteProjectAction, restoreProjectAction } from "../actions";

export function DeleteProjectButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const { notify } = useNotification();

  return (
    <ConfirmForm
      onConfirm={async () => {
        await deleteProjectAction(id);
        notify({
          title: "已刪除專案",
          description: `「${name}」已移至垃圾桶，90 天內可復原。`,
          actionLabel: "復原",
          onAction: async () => {
            await restoreProjectAction(id);
            router.push(`/projects/${id}`);
            router.refresh();
          },
        });
        router.push("/projects");
        router.refresh();
      }}
      triggerLabel="刪除專案"
      triggerIcon={<Trash2 className="size-4" />}
      triggerVariant="destructive"
      title="刪除專案"
      description={`確定要刪除「${name}」嗎？此動作會一併刪除其工程分項、查驗、缺失、文件、履約事項與變更紀錄，可於 90 天內復原。`}
      confirmLabel="刪除"
      confirmVariant="destructive"
      requireText="DELETE"
    />
  );
}
