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
  /** 該日報的數量是否已計入累計（已提送／已核備）。 */
  countsTowardQty = false,
}: {
  id: string;
  label: string;
  countsTowardQty?: boolean;
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
            /*
              已計入累計的日報被刪除，會改變台帳與所有含該日的月報金額，
              包含已定稿送審的那些。內容會留在變更軌跡中，但報表數字會變。
              這不是「怕誤按」，而是刪除的後果不在這個畫面上看得到。
            */
            title: "刪除監造報表？",
            description: countsTowardQty
              ? `${label} 的日報將被移除。此日報已計入累計，刪除後台帳與含該日的月報金額都會隨之改變（包含已定稿者）。完整內容會保留在變更軌跡中。`
              : `${label} 的日報將被移除。內容會保留在變更軌跡中。`,
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
