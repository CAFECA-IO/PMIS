"use client";

import { useRouter } from "next/navigation";
import { Check, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CarbonEntryStatus } from "@/generated/prisma/enums";
import { setEntryStatusAction, removeEntryAction } from "./carbon-actions";

export function CarbonEntryRowActions({
  entryId,
  projectId,
  status,
}: {
  entryId: string;
  projectId: string;
  status: CarbonEntryStatus;
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
            await setEntryStatusAction(entryId, "CONFIRMED", projectId);
            router.refresh();
          }}
        >
          <Check className="size-4" />
          確認
        </Button>
      ) : null}
      {status === "CONFIRMED" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="查證"
          onClick={async () => {
            await setEntryStatusAction(entryId, "VERIFIED", projectId);
            router.refresh();
          }}
        >
          <ShieldCheck className="size-4" />
          查證
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="刪除活動數據"
        onClick={async () => {
          await removeEntryAction(entryId, projectId);
          router.refresh();
        }}
      >
        <Trash2 className="size-4 text-muted-foreground" />
      </Button>
    </div>
  );
}
