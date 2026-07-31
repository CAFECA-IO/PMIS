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
      triggerIcon={<Trash2 className="size-3.5" />}
      /*
        ghost 而非 destructive：這顆按鈕現在待在總覽末尾的虛線區塊裡，
        一片紅色會把整頁的視覺重心拉到「刪除」上 —— 而使用者來這一頁
        九成九是要看進度或改基本資料。份量交給確認視窗（須輸入 DELETE）。
      */
      triggerVariant="ghost"
      triggerSize="sm"
      title="刪除專案"
      description={`確定要刪除「${name}」嗎？此動作會一併刪除其工程分項、查驗、缺失、文件、履約事項與變更紀錄，可於 90 天內復原。`}
      confirmLabel="刪除"
      confirmVariant="destructive"
      requireText="DELETE"
    />
  );
}
