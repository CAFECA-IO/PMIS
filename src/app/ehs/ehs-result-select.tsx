"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Select } from "@/components/ui/select";
import { ehsResultOptions, ehsResultMeta } from "@/constant/pmis";
import { useConfirm } from "@/components/ui/confirm-provider";
import type { EhsResult } from "@/generated/prisma/enums";
import { setEhsResultAction } from "./actions";

// Info: (20260721 - Luphia) 表格內快速修改稽核結果（需經統一 confirm 確認）
export function EhsResultSelect({
  id,
  result,
}: {
  id: string;
  result: EhsResult;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [value, setValue] = useState<string>(result);
  const [pending, startTransition] = useTransition();

  return (
    <Select
      className="h-8 w-28"
      value={value}
      disabled={pending}
      onChange={async (e) => {
        const next = e.target.value;
        const prev = value;
        setValue(next);
        const ok = await confirm({
          title: "變更稽核結果？",
          description: `將結果變更為「${ehsResultMeta[next as EhsResult].label}」。`,
        });
        if (!ok) {
          setValue(prev);
          return;
        }
        startTransition(async () => {
          await setEhsResultAction(id, next);
          router.refresh();
        });
      }}
    >
      {ehsResultOptions.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
