"use client";

import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VoucherStatus } from "@/generated/prisma/enums";
import { setVoucherStatusAction, removeVoucherAction } from "./actions";

export function VoucherRowActions({
  id,
  status,
}: {
  id: string;
  status: VoucherStatus;
}) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-end gap-1">
      {status === "DRAFT" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="確認"
          onClick={async () => {
            await setVoucherStatusAction(id, "CONFIRMED");
            router.refresh();
          }}
        >
          <Check className="size-4" />
          確認
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="刪除傳票"
        onClick={async () => {
          await removeVoucherAction(id);
          router.refresh();
        }}
      >
        <Trash2 className="size-4 text-muted-foreground" />
      </Button>
    </div>
  );
}
